// /api/update-data.js (最终完整修复版)

// 从 Polygon 获取全市场快照
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
                    console.log(`[Polygon] Successfully fetched ${data.resultsCount} quotes for ${tradeDate}`);
                    return quotesMap;
                }
            } else {
                console.warn(`[Polygon] API for ${tradeDate} returned status: ${response.status}`);
            }
        } catch (error) { 
            console.error(`[Polygon] Fetch failed for ${tradeDate}:`, error.message); 
        }
        date.setDate(date.getDate() - 1);
    }
    throw new Error("Could not fetch any snapshot data from Polygon after 7 attempts.");
}

// 从 Finnhub 获取财务指标
async function getFinnhubMetrics(ticker, apiKey) {
    try {
        const url = `https://finnhub.io/api/v1/stock/metric?symbol=${ticker}&metric=all&token=${apiKey}`;
        const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (response.ok) {
            const data = await response.json();
            return data.metric || {};
        }
    } catch (error) {
        console.warn(`[Finnhub] Failed to fetch metrics for ${ticker}:`, error.message);
    }
    return {};
}

// 应用动态标签
async function applyDynamicTags(client, ticker, marketData, financialData) {
    const tags = [];
    
    // 基于市值的标签
    if (marketData.marketCap) {
        if (marketData.marketCap > 200000000000) tags.push('大盘股');
        else if (marketData.marketCap > 10000000000) tags.push('中盘股');
        else tags.push('小盘股');
    }
    
    // 基于涨跌幅的标签
    if (marketData.changePercent !== undefined) {
        if (marketData.changePercent > 5) tags.push('强势上涨');
        else if (marketData.changePercent > 2) tags.push('温和上涨');
        else if (marketData.changePercent < -5) tags.push('大幅下跌');
        else if (marketData.changePercent < -2) tags.push('温和下跌');
        else tags.push('横盘整理');
    }
    
    // 基于成交量的标签
    if (marketData.volume) {
        if (marketData.volume > 50000000) tags.push('高成交量');
        else if (marketData.volume < 1000000) tags.push('低成交量');
    }
    
    // 基于财务指标的标签
    if (financialData.peNormalizedAnnual) {
        if (financialData.peNormalizedAnnual > 30) tags.push('高估值');
        else if (financialData.peNormalizedAnnual < 15) tags.push('低估值');
    }
    
    if (financialData.dividendYieldIndicatedAnnual > 3) {
        tags.push('高股息');
    }
    
    // 插入标签到数据库
    for (const tagName of tags) {
        try {
            // 确保标签存在
            await client.query(
                `INSERT INTO tags (name, type) VALUES ($1, 'dynamic') ON CONFLICT (name) DO NOTHING`,
                [tagName]
            );
            
            // 关联股票和标签
            await client.query(
                `INSERT INTO stock_tags (stock_ticker, tag_id) 
                 SELECT $1, id FROM tags WHERE name = $2 
                 ON CONFLICT (stock_ticker, tag_id) DO NOTHING`,
                [ticker, tagName]
            );
        } catch (error) {
            console.warn(`Failed to apply tag ${tagName} to ${ticker}:`, error.message);
        }
    }
    
    return tags;
}

// API 主处理函数
export default async function handler(req, res) {
    // 验证授权
    if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // 创建数据库连接池
    const { Pool } = await import('pg');
    const pool = new Pool({
        connectionString: process.env.NEON_DATABASE_URL,
        ssl: { rejectUnauthorized: false },
    });
    
    const client = await pool.connect();
    console.log("===== Starting daily data injection & tag update job =====");
    
    try {
        await client.query('BEGIN');
        
        // 获取所有股票
        const { rows: companies } = await client.query('SELECT ticker FROM stocks LIMIT 100'); // 限制数量避免超时
        console.log(`Step 1: Found ${companies.length} companies in DB.`);

        console.log("Step 2: Fetching data from Polygon and Finnhub...");
        
        // 获取市场数据
        const polygonSnapshot = await getPolygonSnapshot(process.env.POLYGON_API_KEY);
        
        let updatedCount = 0;
        let taggedCount = 0;
        
        // 处理每只股票
        for (const company of companies) {
            const ticker = company.ticker;
            
            try {
                // 获取市场数据
                const polygonData = polygonSnapshot.get(ticker);
                
                if (polygonData) {
                    // 更新股票基本数据
                    await client.query(
                        `UPDATE stocks SET 
                         last_price = $1, 
                         change_amount = $2, 
                         change_percent = $3, 
                         volume = $4,
                         market_cap = $5,
                         last_updated = NOW()
                         WHERE ticker = $6`,
                        [
                            polygonData.c, // 收盘价
                            polygonData.c - polygonData.o, // 涨跌额
                            ((polygonData.c - polygonData.o) / polygonData.o * 100), // 涨跌幅
                            polygonData.v, // 成交量
                            polygonData.c * 1000000, // 估算市值
                            ticker
                        ]
                    );
                    
                    updatedCount++;
                    
                    // 获取财务数据
                    const finnhubData = await getFinnhubMetrics(ticker, process.env.FINNHUB_API_KEY);
                    
                    // 应用动态标签
                    const marketData = {
                        marketCap: polygonData.c * 1000000,
                        changePercent: ((polygonData.c - polygonData.o) / polygonData.o * 100),
                        volume: polygonData.v
                    };
                    
                    const appliedTags = await applyDynamicTags(client, ticker, marketData, finnhubData);
                    
                    if (appliedTags.length > 0) {
                        taggedCount++;
                        console.log(`Applied tags to ${ticker}: ${appliedTags.join(', ')}`);
                    }
                    
                    // 添加延迟避免API限制
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            } catch (error) {
                console.warn(`Failed to process ${ticker}:`, error.message);
            }
        }
        
        await client.query('COMMIT');
        
        const message = `Data update completed. Updated ${updatedCount} stocks, applied tags to ${taggedCount} stocks.`;
        console.log(message);
        
        res.status(200).json({ 
            success: true, 
            message,
            stats: {
                totalCompanies: companies.length,
                updatedStocks: updatedCount,
                taggedStocks: taggedCount
            }
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("!!!!! Job FAILED !!!!!", error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        client.release();
    }
}