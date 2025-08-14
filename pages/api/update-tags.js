// /api/update-tags.js (最终黄金组合版)
import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL, ssl: { rejectUnauthorized: false } });

// --- 辅助函数 1: 从 Polygon 高效获取全市场快照 ---
async function getPolygonSnapshot(apiKey) {
    // ... (此处粘贴我们之前最终确认的、能找到最近交易日快照的 getPolygonSnapshot 函数)
}

// --- 辅助函数 2: 从 Finnhub 获取单只股票的财务指标 ---
async function getFinnhubMetrics(symbol, apiKey) {
    // ... (此处粘贴我们之前最终确认的 getFinnhubMetrics 函数)
}

// --- 辅助函数 3: 应用标签 ---
async function applyTag(tagName, tagType, tickers, client) { /* ... 和之前一样 ... */ }

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
        for (const company of companies) {
            const ticker = company.ticker;
            // 为了避免短时间请求过多Finnhub，我们加入一个微小的延迟
            await new Promise(resolve => setTimeout(resolve, 100)); // 100毫秒延迟
            
            const marketData = polygonSnapshot.get(ticker);
            const financialData = await getFinnhubMetrics(ticker, process.env.FINNHUB_API_KEY);
            
            const updates = {}; const values = []; let queryIndex = 1;
            if (marketData) {
                updates.last_price = `$${queryIndex++}`; values.push(marketData.c);
                if (marketData.o > 0) updates.change_percent = `$${queryIndex++}`; values.push(((marketData.c - marketData.o) / marketData.o) * 100);
            }
            if (financialData && financialData.metric) {
                updates.market_cap = `$${queryIndex++}`; values.push(financialData.metric.marketCapitalization);
                updates.roe_ttm = `$${queryIndex++}`; values.push(financialData.metric.roeTTM);
                updates.pe_ttm = `$${queryIndex++}`; values.push(financialData.metric.peTTM);
                updates.week_52_high = `$${queryIndex++}`; values.push(financialData.metric['52WeekHigh']);
                updates.week_52_low = `$${queryIndex++}`; values.push(financialData.metric['52WeekLow']);
                updates.dividend_yield = `$${queryIndex++}`; values.push(financialData.metric.dividendYieldAnnual);
            }
            
            if (Object.keys(updates).length > 0) {
                updates.last_updated = 'NOW()';
                const setClauses = Object.keys(updates).map(key => `${key} = ${updates[key]}`).join(', ');
                await client.query(`UPDATE stocks SET ${setClauses} WHERE ticker = $${queryIndex}`, [...values, ticker]);
                successUpdateCount++;
            }
        }
        console.log(`Step 2 Complete: Updated data for ${successUpdateCount} stocks.`);

        console.log("Step 3: Recalculating dynamic tags...");
        await client.query(`DELETE FROM stock_tags WHERE tag_id IN (SELECT id FROM tags WHERE type != '行业分类' AND type != '特殊名单类');`);
        const { rows: allStocks } = await client.query('SELECT ticker, roe_ttm, week_52_high, last_price FROM stocks');
        
        const highRoeStocks = allStocks.filter(s => s.roe_ttm > 20).map(s => s.ticker);
        await applyTag('高ROE', '财务表现类', highRoeStocks, client);
        
        const newHighStocks = allStocks.filter(s => s.last_price && s.week_52_high && s.last_price >= s.week_52_high * 0.98).map(s => s.ticker);
        await applyTag('52周新高', '股市表现类', newHighStocks, client);
        
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