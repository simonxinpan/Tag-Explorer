// /api/update-data.js
import { Pool } from 'pg';
import { Service } from '@volcengine/openapi'; // 如果新闻标题翻译在这里
// ... (所有辅助函数: getPolygonSnapshot, getFinnhubMetrics, applyTag) ...

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

        // ** 2. 并行获取 Polygon 市场快照 和 Finnhub 财务指标 **
        // ... (完整的、健壮的数据获取和 UPDATE 逻辑) ...
        
        console.log(`Step 2 Complete: Updated data for ${successUpdateCount} stocks.`);

        // ** 3. 清理并重新计算动态标签 **
        // ... (完整的动态标签计算和 applyTag 逻辑) ...
        
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