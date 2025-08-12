// /api/test-update.js - 测试数据更新逻辑（无需认证）
import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL, ssl: { rejectUnauthorized: false } });

// 辅助函数：从 Polygon 获取全市场前一日快照数据
async function getPolygonGroupedDaily(apiKey) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0]; // YYYY-MM-DD格式
    
    const url = `https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${dateStr}?adjusted=true&apikey=${apiKey}`;
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        return data.results || [];
    } catch { return null; }
}

export default async function handler(req, res) {
    const client = await pool.connect();
    try {
        console.log("Starting test data update...");
        
        // 1. 获取前5只股票进行测试
        const { rows: companies } = await client.query('SELECT ticker FROM stocks LIMIT 5');
        console.log(`Testing with ${companies.length} stocks:`, companies.map(c => c.ticker));

        // 2. 获取Polygon数据
        console.log("Fetching market data from Polygon...");
        const polygonData = await getPolygonGroupedDaily(process.env.POLYGON_API_KEY);
        if (!polygonData || polygonData.length === 0) {
            throw new Error('Failed to fetch Polygon market data');
        }
        console.log(`Fetched ${polygonData.length} stocks from Polygon.`);

        // 3. 将Polygon数据转换为映射表
        const polygonMap = new Map();
        polygonData.forEach(stock => {
            polygonMap.set(stock.T, {
                open: stock.o,
                close: stock.c,
                high: stock.h,
                low: stock.l,
                volume: stock.v,
                changePercent: ((stock.c - stock.o) / stock.o * 100).toFixed(2)
            });
        });

        let marketUpdateCount = 0;
        const updateResults = [];
        
        // 4. 测试更新前5只股票
        for (const company of companies) {
            const ticker = company.ticker;
            const marketData = polygonMap.get(ticker);
            
            if (marketData) {
                await client.query(`
                    UPDATE stocks SET 
                        last_price = $1,
                        change_percent = $2,
                        last_updated = NOW()
                    WHERE ticker = $3
                `, [marketData.close, marketData.changePercent, ticker]);
                marketUpdateCount++;
                updateResults.push({
                    ticker,
                    updated: true,
                    price: marketData.close,
                    change: marketData.changePercent
                });
            } else {
                updateResults.push({
                    ticker,
                    updated: false,
                    reason: 'No Polygon data'
                });
            }
        }
        
        // 5. 查询更新后的数据
        const { rows: updatedStocks } = await client.query(`
            SELECT ticker, last_price, change_percent, last_updated 
            FROM stocks 
            WHERE ticker = ANY($1)
        `, [companies.map(c => c.ticker)]);

        res.status(200).json({
            success: true,
            message: `Test update completed. Updated ${marketUpdateCount} stocks.`,
            polygonDataCount: polygonData.length,
            updateResults,
            updatedStocks
        });
    } catch (error) {
        console.error("Test update failed:", error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        client.release();
    }
}