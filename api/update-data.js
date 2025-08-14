// /api/update-data.js (最终黄金组合版)
import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL, ssl: { rejectUnauthorized: false } });

// --- 辅助函数 1: 从 Polygon 高效获取全市场快照 ---
async function getPolygonSnapshot(apiKey) {
    let date = new Date();
    for (let i = 0; i < 7; i++) {
        const tradeDate = date.toISOString().split('T')[0];
        const url = `https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${tradeDate}?adjusted=true&apiKey=${apiKey}`;
        try {
            const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
            if (response.ok) {
                const data = await response.json();
                if (data && data.resultsCount > 0) {
                    console.log(`[Polygon] Successfully found snapshot for date: ${tradeDate}`);
                    const quotesMap = new Map();
                    data.results.forEach(q => quotesMap.set(q.T, q));
                    return quotesMap;
                }
            }
        } catch (error) { console.error(`[Polygon] Failed for date ${tradeDate}:`, error.message); }
        date.setDate(date.getDate() - 1);
    }
    throw new Error("Could not fetch any snapshot data from Polygon after 7 attempts.");
}

// --- 辅助函数 2: 从 Finnhub 获取单只股票的财务指标 ---
async function getFinnhubMetrics(symbol, apiKey) {
    const url = `https://finnhub.io/api/v1/stock/metric?symbol=${symbol}&metric=all&token=${apiKey}`;
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        return res.ok ? res.json() : null;
    } catch { return null; }
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
            await new Promise(resolve => setTimeout(resolve, 120)); // **增加延迟，尊重Finnhub**
            
            const marketData = polygonSnapshot.get(ticker);
            const financialData = await getFinnhubMetrics(ticker, process.env.FINNHUB_API_KEY);
            
            const updates = {}; const values = []; let queryIndex = 1;
            if (marketData) {
                updates.last_price = `$${queryIndex++}`; values.push(marketData.c);
                updates.open_price = `$${queryIndex++}`; values.push(marketData.o);
                updates.high_price = `$${queryIndex++}`; values.push(marketData.h);
                updates.low_price = `$${queryIndex++}`; values.push(marketData.l);
                updates.volume = `$${queryIndex++}`; values.push(marketData.v);
                if (marketData.o > 0) {
                    updates.change_percent = `$${queryIndex++}`; values.push(((marketData.c - marketData.o) / marketData.o) * 100);
                    updates.change_amount = `$${queryIndex++}`; values.push(marketData.c - marketData.o);
                }
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
        // ... (动态标签计算逻辑和之前一样) ...
        
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