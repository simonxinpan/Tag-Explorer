// /api/check-tags-schema.js - 检查stock_tags表结构
import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL, ssl: { rejectUnauthorized: false } });

export default async function handler(req, res) {
    const client = await pool.connect();
    try {
        // 查询stock_tags表结构
        const { rows: stockTagsColumns } = await client.query(`
            SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_name = 'stock_tags' 
            ORDER BY ordinal_position
        `);
        
        // 查询tags表结构
        const { rows: tagsColumns } = await client.query(`
            SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_name = 'tags' 
            ORDER BY ordinal_position
        `);
        
        // 查询前5条数据示例
        const { rows: stockTagsSampleData } = await client.query('SELECT * FROM stock_tags LIMIT 5');
        const { rows: tagsSampleData } = await client.query('SELECT * FROM tags LIMIT 5');
        
        // 查询所有表名
        const { rows: tables } = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);
        
        res.status(200).json({
            success: true,
            stockTagsSchema: stockTagsColumns,
            tagsSchema: tagsColumns,
            stockTagsSampleData,
            tagsSampleData,
            allTables: tables.map(t => t.table_name)
        });
    } catch (error) {
        console.error("Schema check failed:", error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        client.release();
    }
}