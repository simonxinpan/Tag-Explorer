// /api/update-tags.js (最终黄金组合版)
import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL, ssl: { rejectUnauthorized: false } });

// --- 辅助函数 1: 从 Polygon 高效获取全市场快照 ---
async function getPolygonSnapshot(apiKey) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];
    
    const url = `https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${dateStr}?adjusted=true&apikey=${apiKey}`;
    try {
        const res = await fetch(url);
        if (!res.ok) {
            console.error(`Polygon API error: ${res.status} ${res.statusText}`);
            return new Map();
        }
        const data = await res.json();
        const snapshot = new Map();
        
        if (data.results && Array.isArray(data.results)) {
            data.results.forEach(stock => {
                snapshot.set(stock.T, {
                    c: stock.c, // close price
                    o: stock.o, // open price
                    h: stock.h, // high price
                    l: stock.l, // low price
                    v: stock.v  // volume
                });
            });
        }
        console.log(`Polygon snapshot loaded: ${snapshot.size} stocks`);
        return snapshot;
    } catch (error) {
        console.error('Polygon API fetch error:', error);
        return new Map();
    }
}

// --- 辅助函数 2: 从 Finnhub 获取单只股票的财务指标 ---
async function getFinnhubMetrics(symbol, apiKey) {
    try {
        const res = await fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${symbol}&metric=all&token=${apiKey}`);
        if (!res.ok) {
            if (res.status === 429) {
                console.log(`Rate limit hit for ${symbol}, skipping...`);
                return null;
            }
            return null;
        }
        const data = await res.json();
        return data;
    } catch (error) {
        console.log(`Finnhub error for ${symbol}:`, error.message);
        return null;
    }
}

// --- 辅助函数 3: 应用标签 ---
async function applyTag(tagName, tagType, tickers, client) {
    if (tickers.length === 0) return;
    
    // 1. 查找或创建标签
    let tagId;
    const { rows: existingTag } = await client.query(
        'SELECT id FROM tags WHERE name = $1', [tagName]
    );
    
    if (existingTag.length > 0) {
        tagId = existingTag[0].id;
    } else {
        const { rows: newTag } = await client.query(
            'INSERT INTO tags (name, type) VALUES ($1, $2) RETURNING id',
            [tagName, tagType]
        );
        tagId = newTag[0].id;
    }
    
    // 2. 删除该标签的所有现有关联
    await client.query('DELETE FROM stock_tags WHERE tag_id = $1', [tagId]);
    
    // 3. 批量插入新的股票-标签关联
    if (tickers.length > 0) {
        const values = tickers.map((_, i) => `($${i*2+1}, $${i*2+2})`).join(',');
        const params = tickers.flatMap(ticker => [ticker, tagId]);
        
        await client.query(`
            INSERT INTO stock_tags (stock_ticker, tag_id) 
            VALUES ${values}
        `, params);
    }
    
    console.log(`Applied tag "${tagName}" to ${tickers.length} stocks`);
}

// --- API 主处理函数 ---
export default async function handler(req, res) {
    if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const client = await pool.connect();
    console.log("===== Starting daily data injection & tag update job =====");
    
    try {
        await client.query('BEGIN');
        const { rows: companies } = await client.query('SELECT ticker FROM stocks');
        console.log(`Step 1: Found ${companies.length} companies in DB.`);

        console.log("Step 2: Fetching data from Polygon (market) and Finnhub (financials)...");
        const polygonSnapshot = await getPolygonSnapshot(process.env.POLYGON_API_KEY);
        
        let successUpdateCount = 0;
        let marketDataCount = 0;
        let financialDataCount = 0;
        
        // 批量处理，每100只股票为一批
        const batchSize = 100;
        for (let i = 0; i < companies.length; i += batchSize) {
            const batch = companies.slice(i, i + batchSize);
            console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(companies.length/batchSize)} (${batch.length} stocks)...`);
            
            for (const company of batch) {
                const ticker = company.ticker;
                
                // 获取市场数据（来自Polygon快照）
                const marketData = polygonSnapshot.get(ticker);
                
                // 获取财务数据（来自Finnhub，添加延迟避免限流）
                await new Promise(resolve => setTimeout(resolve, 50)); // 50毫秒延迟
                const financialData = await getFinnhubMetrics(ticker, process.env.FINNHUB_API_KEY);
                
                const updates = {}; const values = []; let queryIndex = 1;
                
                // 处理市场数据
                if (marketData) {
                    updates.last_price = `$${queryIndex++}`; values.push(marketData.c);
                    if (marketData.o > 0) {
                        const changePercent = ((marketData.c - marketData.o) / marketData.o) * 100;
                        updates.change_percent = `$${queryIndex++}`; values.push(changePercent);
                    }
                    marketDataCount++;
                }
                
                // 处理财务数据
                if (financialData && financialData.metric) {
                    const metric = financialData.metric;
                    if (metric.marketCapitalization) {
                        updates.market_cap = `$${queryIndex++}`; values.push(metric.marketCapitalization);
                    }
                    if (metric.roeTTM) {
                        updates.roe_ttm = `$${queryIndex++}`; values.push(metric.roeTTM);
                    }
                    if (metric.peTTM) {
                        updates.pe_ttm = `$${queryIndex++}`; values.push(metric.peTTM);
                    }
                    if (metric['52WeekHigh']) {
                        updates.week_52_high = `$${queryIndex++}`; values.push(metric['52WeekHigh']);
                    }
                    if (metric['52WeekLow']) {
                        updates.week_52_low = `$${queryIndex++}`; values.push(metric['52WeekLow']);
                    }
                    if (metric.dividendYieldAnnual) {
                        updates.dividend_yield = `$${queryIndex++}`; values.push(metric.dividendYieldAnnual);
                    }
                    financialDataCount++;
                }
                
                // 执行更新
                if (Object.keys(updates).length > 0) {
                    updates.last_updated = 'NOW()';
                    const setClauses = Object.keys(updates).map(key => `${key} = ${updates[key]}`).join(', ');
                    await client.query(`UPDATE stocks SET ${setClauses} WHERE ticker = $${queryIndex}`, [...values, ticker]);
                    successUpdateCount++;
                }
            }
        }
        
        console.log(`Step 2 Complete: Updated ${successUpdateCount} stocks (Market: ${marketDataCount}, Financial: ${financialDataCount})`);

        console.log("Step 3: Recalculating dynamic tags...");
        // 清除所有动态标签（保留行业分类和特殊名单类）
        await client.query(`
            DELETE FROM stock_tags 
            WHERE tag_id IN (
                SELECT id FROM tags 
                WHERE type NOT IN ('行业分类', '特殊名单类')
            )
        `);
        
        // 获取所有股票数据用于标签计算
        const { rows: allStocks } = await client.query(`
            SELECT ticker, last_price, change_percent, market_cap, roe_ttm, pe_ttm, 
                   week_52_high, week_52_low, dividend_yield
            FROM stocks 
            WHERE last_price IS NOT NULL
        `);
        
        console.log(`Calculating tags for ${allStocks.length} stocks with valid data...`);
        
        // 1. 股价表现类标签
        const highGrowthStocks = allStocks.filter(s => s.change_percent > 5).map(s => s.ticker);
        await applyTag('高增长', '股价表现', highGrowthStocks, client);
        
        const lowPerformanceStocks = allStocks.filter(s => s.change_percent < -5).map(s => s.ticker);
        await applyTag('大跌', '股价表现', lowPerformanceStocks, client);
        
        const newHighStocks = allStocks.filter(s => 
            s.week_52_high && s.last_price >= s.week_52_high * 0.98
        ).map(s => s.ticker);
        await applyTag('52周新高', '股价表现', newHighStocks, client);
        
        const newLowStocks = allStocks.filter(s => 
            s.week_52_low && s.last_price <= s.week_52_low * 1.02
        ).map(s => s.ticker);
        await applyTag('52周新低', '股价表现', newLowStocks, client);
        
        // 2. 市值分类标签
        const largeCapStocks = allStocks.filter(s => 
            s.market_cap && s.market_cap > 10000000000 // 100亿美元
        ).map(s => s.ticker);
        await applyTag('大盘股', '市值分类', largeCapStocks, client);
        
        const midCapStocks = allStocks.filter(s => 
            s.market_cap && s.market_cap > 2000000000 && s.market_cap <= 10000000000 // 20-100亿美元
        ).map(s => s.ticker);
        await applyTag('中盘股', '市值分类', midCapStocks, client);
        
        const smallCapStocks = allStocks.filter(s => 
            s.market_cap && s.market_cap <= 2000000000 // 20亿美元以下
        ).map(s => s.ticker);
        await applyTag('小盘股', '市值分类', smallCapStocks, client);
        
        // 3. 财务表现类标签
        const highRoeStocks = allStocks.filter(s => s.roe_ttm && s.roe_ttm > 20).map(s => s.ticker);
        await applyTag('高ROE', '财务表现', highRoeStocks, client);
        
        const valueStocks = allStocks.filter(s => 
            s.pe_ttm && s.pe_ttm > 0 && s.pe_ttm < 15
        ).map(s => s.ticker);
        await applyTag('价值股', '财务表现', valueStocks, client);
        
        const growthStocks = allStocks.filter(s => 
            s.pe_ttm && s.pe_ttm > 25
        ).map(s => s.ticker);
        await applyTag('成长股', '财务表现', growthStocks, client);
        
        // 4. 分红类标签
        const dividendStocks = allStocks.filter(s => 
            s.dividend_yield && s.dividend_yield > 3
        ).map(s => s.ticker);
        await applyTag('高分红', '分红收益', dividendStocks, client);
        
        const lowDividendStocks = allStocks.filter(s => 
            s.dividend_yield && s.dividend_yield > 0 && s.dividend_yield <= 3
        ).map(s => s.ticker);
        await applyTag('低分红', '分红收益', lowDividendStocks, client);
        
        console.log("Step 3 Complete: Dynamic tags recalculated.");
        
        await client.query('COMMIT');
        res.status(200).json({ success: true, message: `Data and tags updated.` });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("!!!!! Job FAILED !!!!!", error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        client.release();
    }
}