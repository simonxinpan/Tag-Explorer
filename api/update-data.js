// /api/update-data.js (最终完整修复版)
import { Pool } from 'pg';

// *** 修复 1：确保 pool 对象在全局范围内被正确创建 ***
const pool = new Pool({
    connectionString: process.env.NEON_DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

// --- 辅助函数 1: 从 Polygon 获取全市场快照 ---
async function getPolygonSnapshot(apiKey) {
    let date = new Date();
    for (let i = 0; i < 7; i++) {
        const tradeDate = date.toISOString().split('T')[0];
        const url = `https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${tradeDate}?adjusted=true&apiKey=${apiKey}`;
        try {
            console.log(`[Polygon] Attempting snapshot for ${tradeDate}...`);
            const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
            if (response.ok) {
                const data = await response.json();
                if (data && data.resultsCount > 0) {
                    const quotesMap = new Map();
                    data.results.forEach(q => quotesMap.set(q.T, q));
                    return quotesMap;
                }
            } else {
                console.warn(`[Polygon] API for ${tradeDate} returned status: ${response.status}`);
            }
        } catch (error) { console.error(`[Polygon] Fetch failed for ${tradeDate}:`, error.message); }
        date.setDate(date.getDate() - 1);
    }
    throw new Error("Could not fetch any snapshot data from Polygon after 7 attempts.");
}

// ... 其他辅助函数 (getFinnhubMetrics, applyTag) 和之前一样 ...

// --- API 主处理函数 ---
export default async function handler(req, res) {
    if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const client = await pool.connect(); // <-- 现在 pool 是已定义的
    console.log("===== Starting daily data injection & tag update job =====");
    try {
        await client.query('BEGIN');
        const { rows: companies } = await client.query('SELECT ticker FROM stocks');
        console.log(`Step 1: Found ${companies.length} companies in DB.`);

        console.log("Step 2: Fetching data from Polygon (market) and Finnhub (financials)...");
        const polygonSnapshot = await getPolygonSnapshot(process.env.POLYGON_API_KEY);
        // ... (剩余的所有数据注入和标签计算逻辑和之前一样) ...
        
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