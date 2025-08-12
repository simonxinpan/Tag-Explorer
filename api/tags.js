// /api/tags.js
import { Pool } from 'pg';

const pool = new Pool({
    connectionString: process.env.NEON_DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

export default async function handler(req, res) {
    const { symbol, tag_name } = req.query;
    const client = await pool.connect();
     
    try {
        let data;
        if (symbol) { // 场景1: 查询某只股票的所有标签
            const { rows } = await client.query(
                `SELECT t.name, t.type FROM tags t
                 JOIN stock_tags st ON t.id = st.tag_id
                 WHERE st.stock_ticker = $1 ORDER BY t.type, t.name`, 
                [symbol.toUpperCase()]
            );
            data = rows;
        } else if (tag_name) { // 场景2: 查询拥有某个标签的所有股票
            const { rows } = await client.query(
                `SELECT s.ticker, s.name_zh, s.change_percent FROM stocks s
                 JOIN stock_tags st ON s.ticker = st.stock_ticker
                 JOIN tags t ON st.tag_id = t.id
                 WHERE t.name = $1 ORDER BY s.market_cap DESC NULLS LAST`, 
                [tag_name]
            );
            data = rows;
        } else { // 场景3: (默认) 获取所有标签及其股票数量
            const { rows } = await client.query(
                `SELECT t.name, t.type, COUNT(st.stock_ticker)::int as stock_count FROM tags t
                 LEFT JOIN stock_tags st ON t.id = st.tag_id
                 GROUP BY t.id
                 HAVING COUNT(st.stock_ticker) > 0 -- 只返回有关联股票的标签
                 ORDER BY t.type, stock_count DESC, t.name`
            );
            data = rows;
        }
        res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate'); // 缓存5分钟
        res.status(200).json(data);
    } catch (error) {
        console.error(`API /tags Error:`, error);
        res.status(500).json({ error: 'Database query failed.' });
    } finally {
        if (client) client.release();
    }
}