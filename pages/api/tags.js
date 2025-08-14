// /api/tags.js

// Mock数据
function getMockData() {
    return {
        tags: [
            { id: 1, name: '大盘股', type: 'dynamic', stock_count: 45 },
            { id: 2, name: '中盘股', type: 'dynamic', stock_count: 32 },
            { id: 3, name: '小盘股', type: 'dynamic', stock_count: 28 },
            { id: 4, name: '强势上涨', type: 'dynamic', stock_count: 15 },
            { id: 5, name: '温和上涨', type: 'dynamic', stock_count: 22 },
            { id: 6, name: '温和下跌', type: 'dynamic', stock_count: 18 },
            { id: 7, name: '科技股', type: 'static', stock_count: 35 },
            { id: 8, name: '金融股', type: 'static', stock_count: 25 },
            { id: 9, name: '医疗保健', type: 'static', stock_count: 20 },
            { id: 10, name: '消费品', type: 'static', stock_count: 18 },
            { id: 11, name: '能源股', type: 'static', stock_count: 12 },
            { id: 12, name: '高价股', type: 'dynamic', stock_count: 8 },
            { id: 13, name: '低价股', type: 'dynamic', stock_count: 25 }
        ],
        stocks: [
            {
                ticker: 'AAPL',
                name: 'Apple Inc.',
                name_zh: '苹果公司',
                sector_zh: '科技股',
                last_price: 175.43,
                change_percent: 2.15,
                market_cap: 2800000000000,
                tags: ['大盘股', '科技股', '强势上涨', '高价股']
            },
            {
                ticker: 'MSFT',
                name: 'Microsoft Corporation',
                name_zh: '微软公司',
                sector_zh: '科技股',
                last_price: 378.85,
                change_percent: 1.87,
                market_cap: 2750000000000,
                tags: ['大盘股', '科技股', '温和上涨', '高价股']
            },
            {
                ticker: 'GOOGL',
                name: 'Alphabet Inc.',
                name_zh: '谷歌母公司',
                sector_zh: '科技股',
                last_price: 142.56,
                change_percent: -0.45,
                market_cap: 1800000000000,
                tags: ['大盘股', '科技股', '中价股']
            },
            {
                ticker: 'TSLA',
                name: 'Tesla Inc.',
                name_zh: '特斯拉',
                sector_zh: '消费品',
                last_price: 248.42,
                change_percent: 3.25,
                market_cap: 800000000000,
                tags: ['大盘股', '消费品', '强势上涨', '中价股']
            },
            {
                ticker: 'JPM',
                name: 'JPMorgan Chase & Co.',
                name_zh: '摩根大通',
                sector_zh: '金融股',
                last_price: 158.73,
                change_percent: 0.85,
                market_cap: 450000000000,
                tags: ['大盘股', '金融股', '温和上涨', '中价股']
            },
            {
                ticker: 'JNJ',
                name: 'Johnson & Johnson',
                name_zh: '强生公司',
                sector_zh: '医疗保健',
                last_price: 162.45,
                change_percent: -0.32,
                market_cap: 420000000000,
                tags: ['大盘股', '医疗保健', '中价股']
            },
            {
                ticker: 'XOM',
                name: 'Exxon Mobil Corporation',
                name_zh: '埃克森美孚',
                sector_zh: '能源股',
                last_price: 108.92,
                change_percent: 1.45,
                market_cap: 380000000000,
                tags: ['大盘股', '能源股', '温和上涨', '中价股']
            },
            {
                ticker: 'AMD',
                name: 'Advanced Micro Devices',
                name_zh: 'AMD公司',
                sector_zh: '科技股',
                last_price: 142.18,
                change_percent: 4.67,
                market_cap: 230000000000,
                tags: ['中盘股', '科技股', '强势上涨', '中价股']
            },
            {
                ticker: 'NVDA',
                name: 'NVIDIA Corporation',
                name_zh: '英伟达',
                sector_zh: '科技股',
                last_price: 875.28,
                change_percent: 2.94,
                market_cap: 2200000000000,
                tags: ['大盘股', '科技股', '温和上涨', '高价股']
            },
            {
                ticker: 'BAC',
                name: 'Bank of America Corp',
                name_zh: '美国银行',
                sector_zh: '金融股',
                last_price: 38.45,
                change_percent: -1.23,
                market_cap: 280000000000,
                tags: ['中盘股', '金融股', '温和下跌', '低价股']
            }
        ]
    };
}

// 检查数据库连接是否可用
function shouldUseMockData() {
    const dbUrl = process.env.NEON_DATABASE_URL;
    return !dbUrl || dbUrl.includes('username:password@host') || dbUrl.includes('your_') || dbUrl === 'postgresql://username:password@host:port/database?sslmode=require';
}

export default async function handler(req, res) {
    const { symbol, tag, tag_name } = req.query;
    
    // 如果数据库配置不正确，使用mock数据
    if (shouldUseMockData()) {
        console.log('Using mock data - database not configured');
        const mockData = getMockData();
        
        if (symbol) {
            // 查询某只股票的所有标签
            const stock = mockData.stocks.find(s => s.ticker.toUpperCase() === symbol.toUpperCase());
            const data = stock ? stock.tags.map(tagName => ({ name: tagName, type: 'dynamic' })) : [];
            return res.status(200).json(data);
        } else if (tag || tag_name) {
            // 查询拥有某个标签的所有股票
            const targetTag = tag || tag_name;
            const data = mockData.stocks.filter(stock => 
                stock.tags.some(t => t === targetTag)
            ).map(stock => ({
                ticker: stock.ticker,
                name_zh: stock.name_zh,
                change_percent: stock.change_percent,
                last_price: stock.last_price,
                sector_zh: stock.sector_zh,
                tags: stock.tags
            }));
            return res.status(200).json({ stocks: data, tags: mockData.tags });
        } else {
            // 获取所有标签及其股票数量
            return res.status(200).json({ tags: mockData.tags, stocks: mockData.stocks });
        }
    }
    
    // 尝试连接真实数据库
    try {
        const { Pool } = await import('pg');
        const pool = new Pool({
            connectionString: process.env.NEON_DATABASE_URL,
            ssl: { rejectUnauthorized: false },
        });
        
        const client = await pool.connect();
        
        try {
            let data;
            if (symbol) {
                const { rows } = await client.query(
                    `SELECT t.name, t.type FROM tags t
                     JOIN stock_tags st ON t.id = st.tag_id
                     WHERE st.stock_ticker = $1 ORDER BY t.type, t.name`, 
                    [symbol.toUpperCase()]
                );
                data = rows;
            } else if (tag || tag_name) {
                const targetTag = tag || tag_name;
                const { rows } = await client.query(
                    `SELECT s.ticker, s.name_zh, s.change_percent, s.last_price, s.sector_zh FROM stocks s
                     JOIN stock_tags st ON s.ticker = st.stock_ticker
                     JOIN tags t ON st.tag_id = t.id
                     WHERE t.name = $1 ORDER BY s.market_cap DESC NULLS LAST`, 
                    [targetTag]
                );
                
                const tagsQuery = await client.query(
                    `SELECT t.id, t.name, t.type, COUNT(st.stock_ticker)::int as stock_count FROM tags t
                     LEFT JOIN stock_tags st ON t.id = st.tag_id
                     GROUP BY t.id
                     ORDER BY t.type, stock_count DESC, t.name`
                );
                
                data = { stocks: rows, tags: tagsQuery.rows };
            } else {
                const tagsQuery = await client.query(
                    `SELECT t.id, t.name, t.type, COUNT(st.stock_ticker)::int as stock_count FROM tags t
                     LEFT JOIN stock_tags st ON t.id = st.tag_id
                     GROUP BY t.id
                     HAVING COUNT(st.stock_ticker) > 0
                     ORDER BY t.type, stock_count DESC, t.name`
                );
                
                const stocksQuery = await client.query(
                    `SELECT s.ticker, s.name_zh, s.last_price, s.change_percent, s.sector_zh FROM stocks s
                     WHERE s.last_price IS NOT NULL
                     ORDER BY s.market_cap DESC NULLS LAST
                     LIMIT 50`
                );
                
                data = { tags: tagsQuery.rows, stocks: stocksQuery.rows };
            }
            
            res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
            res.status(200).json(data);
        } finally {
            client.release();
            await pool.end();
        }
    } catch (error) {
        console.error('Database connection failed, falling back to mock data:', error.message);
        // 数据库连接失败，回退到mock数据
        const mockData = getMockData();
        res.status(200).json({ tags: mockData.tags, stocks: mockData.stocks });
    }
}