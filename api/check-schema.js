// /api/check-schema.js - 检查stocks表结构
import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL, ssl: { rejectUnauthorized: false } });

export default async function handler(req, res) {
    const client = await pool.connect();
    try {
        // 查询表结构
        const { rows: columns } = await client.query(`
            SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_name = 'stocks' 
            ORDER BY ordinal_position
        `);
        
        // 查询前3条数据示例
        const { rows: sampleData } = await client.query('SELECT * FROM stocks LIMIT 3');
        
        res.status(200).json({
            success: true,
            tableSchema: columns,
            sampleData
        });
    } catch (error) {
        console.error("Schema check failed:", error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        client.release();
    }
}