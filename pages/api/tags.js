// /api/tags.js
export default async function handler(req, res) {
    const { symbol, tag_name } = req.query;
    
    // 检查是否有数据库连接配置
    if (!process.env.NEON_DATABASE_URL || process.env.NEON_DATABASE_URL.includes('username:password')) {
        // 返回模拟数据用于演示
        return handleMockData(req, res, { symbol, tag_name });
    }
    
    // 只在需要时导入数据库模块
    const { Pool } = await import('pg');
    const pool = new Pool({
        connectionString: process.env.NEON_DATABASE_URL,
        ssl: { rejectUnauthorized: false },
    });
    
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

// 模拟数据处理函数
function handleMockData(req, res, { symbol, tag_name }) {
    const mockTags = [
        { name: '大盘股', type: 'dynamic', stock_count: 45 },
        { name: '科技股', type: 'dynamic', stock_count: 32 },
        { name: '强势上涨', type: 'dynamic', stock_count: 28 },
        { name: '高价股', type: 'dynamic', stock_count: 23 },
        { name: '金融股', type: 'dynamic', stock_count: 19 },
        { name: '医药股', type: 'dynamic', stock_count: 15 },
        { name: '能源股', type: 'dynamic', stock_count: 12 },
        { name: '消费股', type: 'dynamic', stock_count: 18 },
        { name: '中盘股', type: 'dynamic', stock_count: 35 },
        { name: '温和上涨', type: 'dynamic', stock_count: 22 }
    ];
    
    const mockStocks = [
        { ticker: 'AAPL', name_zh: '苹果公司', change_percent: 2.45 },
        { ticker: 'MSFT', name_zh: '微软公司', change_percent: 1.87 },
        { ticker: 'GOOGL', name_zh: '谷歌', change_percent: 3.21 },
        { ticker: 'AMZN', name_zh: '亚马逊', change_percent: -0.95 },
        { ticker: 'TSLA', name_zh: '特斯拉', change_percent: 4.67 },
        { ticker: 'META', name_zh: 'Meta平台', change_percent: 2.13 },
        { ticker: 'NVDA', name_zh: '英伟达', change_percent: 5.89 },
        { ticker: 'NFLX', name_zh: '奈飞', change_percent: 1.45 }
    ];
    
    if (symbol) {
        // 返回某只股票的标签
        const stockTags = [
            { name: '大盘股', type: 'dynamic' },
            { name: '科技股', type: 'dynamic' },
            { name: '强势上涨', type: 'dynamic' }
        ];
        res.status(200).json(stockTags);
    } else if (tag_name) {
        // 返回某个标签下的股票
        res.status(200).json(mockStocks.slice(0, 5));
    } else {
        // 返回所有标签
        res.status(200).json(mockTags);
    }
}