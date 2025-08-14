// /api/test-env.js - 测试环境变量和数据库连接
import { Pool } from 'pg';

export default async function handler(req, res) {
    // 检查环境变量
    const envCheck = {
        NEON_DATABASE_URL: !!process.env.NEON_DATABASE_URL,
        POLYGON_API_KEY: !!process.env.POLYGON_API_KEY,
        FINNHUB_API_KEY: !!process.env.FINNHUB_API_KEY,
        CRON_SECRET: !!process.env.CRON_SECRET
    };

    // 测试数据库连接
    let dbStatus = 'disconnected';
    let stockCount = 0;
    
    try {
        const pool = new Pool({ 
            connectionString: process.env.NEON_DATABASE_URL, 
            ssl: { rejectUnauthorized: false } 
        });
        const client = await pool.connect();
        
        const { rows } = await client.query('SELECT COUNT(*) as count FROM stocks');
        stockCount = rows[0].count;
        dbStatus = 'connected';
        
        client.release();
    } catch (error) {
        dbStatus = `error: ${error.message}`;
    }

    res.status(200).json({
        timestamp: new Date().toISOString(),
        environment: envCheck,
        database: {
            status: dbStatus,
            stockCount: stockCount
        }
    });
}