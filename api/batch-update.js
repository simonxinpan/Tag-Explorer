// /api/batch-update.js - 高效批量数据更新API
import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL, ssl: { rejectUnauthorized: false } });

// 从 Polygon 获取批量市场数据
async function getPolygonBatchData(apiKey, limit = 1000) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];
    
    const url = `https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${dateStr}?adjusted=true&apikey=${apiKey}`;
    try {
        const res = await fetch(url);
        if (!res.ok) {
            console.error(`Polygon API error: ${res.status} ${res.statusText}`);
            return [];
        }
        const data = await res.json();
        return data.results ? data.results.slice(0, limit) : [];
    } catch (error) {
        console.error('Polygon API fetch error:', error);
        return [];
    }
}

// 批量更新市场数据
async function batchUpdateMarketData(marketData, client) {
    if (marketData.length === 0) return 0;
    
    console.log(`Batch updating ${marketData.length} stocks with market data...`);
    
    // 构建批量更新SQL
    const values = [];
    const placeholders = [];
    let paramIndex = 1;
    
    marketData.forEach((stock, index) => {
        const changePercent = stock.o > 0 ? ((stock.c - stock.o) / stock.o * 100) : 0;
        
        placeholders.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2})`);
        values.push(stock.T, stock.c, changePercent);
        paramIndex += 3;
    });
    
    const query = `
        UPDATE stocks SET 
            last_price = data.price,
            change_percent = data.change_pct,
            last_updated = NOW()
        FROM (VALUES ${placeholders.join(',')}) AS data(ticker, price, change_pct)
        WHERE stocks.ticker = data.ticker
    `;
    
    const result = await client.query(query, values);
    return result.rowCount;
}

// 获取需要财务数据的股票列表（优先处理NULL值较多的）
async function getStocksNeedingFinancialData(client, limit = 200) {
    const { rows } = await client.query(`
        SELECT ticker,
               CASE WHEN market_cap IS NULL THEN 1 ELSE 0 END +
               CASE WHEN roe_ttm IS NULL THEN 1 ELSE 0 END +
               CASE WHEN pe_ttm IS NULL THEN 1 ELSE 0 END +
               CASE WHEN dividend_yield IS NULL THEN 1 ELSE 0 END AS null_count
        FROM stocks 
        WHERE last_price IS NOT NULL
        ORDER BY null_count DESC, ticker
        LIMIT $1
    `, [limit]);
    
    return rows.map(r => r.ticker);
}

// 批量获取财务数据（带重试机制）
async function batchGetFinancialData(tickers, apiKey) {
    const results = new Map();
    const batchSize = 10; // 每批10只股票
    const delayMs = 200; // 每批之间延迟200ms
    
    for (let i = 0; i < tickers.length; i += batchSize) {
        const batch = tickers.slice(i, i + batchSize);
        console.log(`Fetching financial data batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(tickers.length/batchSize)}...`);
        
        // 并行获取当前批次的数据
        const promises = batch.map(async (ticker) => {
            try {
                const res = await fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${ticker}&metric=all&token=${apiKey}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.metric) {
                        results.set(ticker, data.metric);
                    }
                }
            } catch (error) {
                console.log(`Error fetching ${ticker}:`, error.message);
            }
        });
        
        await Promise.all(promises);
        
        // 批次间延迟
        if (i + batchSize < tickers.length) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
    
    return results;
}

// 批量更新财务数据
async function batchUpdateFinancialData(financialData, client) {
    if (financialData.size === 0) return 0;
    
    console.log(`Batch updating ${financialData.size} stocks with financial data...`);
    
    let updateCount = 0;
    
    for (const [ticker, metric] of financialData) {
        const updates = [];
        const values = [];
        let paramIndex = 1;
        
        if (metric.marketCapitalization) {
            updates.push(`market_cap = $${paramIndex++}`);
            values.push(metric.marketCapitalization);
        }
        if (metric.roeTTM) {
            updates.push(`roe_ttm = $${paramIndex++}`);
            values.push(metric.roeTTM);
        }
        if (metric.peTTM) {
            updates.push(`pe_ttm = $${paramIndex++}`);
            values.push(metric.peTTM);
        }
        if (metric['52WeekHigh']) {
            updates.push(`week_52_high = $${paramIndex++}`);
            values.push(metric['52WeekHigh']);
        }
        if (metric['52WeekLow']) {
            updates.push(`week_52_low = $${paramIndex++}`);
            values.push(metric['52WeekLow']);
        }
        if (metric.dividendYieldAnnual) {
            updates.push(`dividend_yield = $${paramIndex++}`);
            values.push(metric.dividendYieldAnnual);
        }
        
        if (updates.length > 0) {
            updates.push(`last_updated = NOW()`);
            const query = `UPDATE stocks SET ${updates.join(', ')} WHERE ticker = $${paramIndex}`;
            values.push(ticker);
            
            await client.query(query, values);
            updateCount++;
        }
    }
    
    return updateCount;
}

export default async function handler(req, res) {
    // 验证授权
    if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const client = await pool.connect();
    const startTime = Date.now();
    
    try {
        await client.query('BEGIN');
        
        console.log("===== Starting batch data update job =====");
        
        // 1. 获取并更新市场数据
        console.log("Step 1: Fetching and updating market data...");
        const marketData = await getPolygonBatchData(process.env.POLYGON_API_KEY);
        const marketUpdateCount = await batchUpdateMarketData(marketData, client);
        console.log(`Market data updated: ${marketUpdateCount} stocks`);
        
        // 2. 获取需要财务数据的股票
        console.log("Step 2: Identifying stocks needing financial data...");
        const stocksNeedingData = await getStocksNeedingFinancialData(client, 300);
        console.log(`Found ${stocksNeedingData.length} stocks needing financial data`);
        
        // 3. 批量获取并更新财务数据
        if (stocksNeedingData.length > 0) {
            console.log("Step 3: Fetching and updating financial data...");
            const financialData = await batchGetFinancialData(stocksNeedingData, process.env.FINNHUB_API_KEY);
            const financialUpdateCount = await batchUpdateFinancialData(financialData, client);
            console.log(`Financial data updated: ${financialUpdateCount} stocks`);
        }
        
        await client.query('COMMIT');
        
        const duration = (Date.now() - startTime) / 1000;
        
        res.status(200).json({
            success: true,
            message: 'Batch update completed successfully',
            stats: {
                marketDataUpdated: marketUpdateCount,
                financialDataUpdated: stocksNeedingData.length > 0 ? await batchUpdateFinancialData(await batchGetFinancialData(stocksNeedingData, process.env.FINNHUB_API_KEY), client) : 0,
                duration: `${duration}s`,
                timestamp: new Date().toISOString()
            }
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Batch update failed:", error);
        res.status(500).json({ 
            success: false, 
            error: error.message,
            timestamp: new Date().toISOString()
        });
    } finally {
        client.release();
    }
}