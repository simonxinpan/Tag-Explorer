// /api/update-all-data.js - 统一的数据更新API
export default async function handler(req, res) {
    // 验证授权
    if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log("===== Starting unified data update job =====");
    
    try {
        // 创建数据库连接池
        const { Pool } = await import('pg');
        const pool = new Pool({
            connectionString: process.env.NEON_DATABASE_URL,
            ssl: { rejectUnauthorized: false },
        });
        
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // 第一步：更新股票基础数据
            console.log("Step 1: Updating stock data...");
            await updateStockData(client);
            
            // 第二步：更新动态标签
            console.log("Step 2: Updating dynamic tags...");
            await updateDynamicTags(client);
            
            await client.query('COMMIT');
            console.log("===== All updates completed successfully =====");
            
            res.status(200).json({ 
                success: true, 
                message: 'All data updated successfully',
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
            await pool.end();
        }
        
    } catch (error) {
        console.error('Update job failed:', error);
        res.status(500).json({ 
            error: 'Update failed', 
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
}

// 更新股票数据的函数
async function updateStockData(client) {
    try {
        // 获取Polygon快照数据
        const polygonData = await getPolygonSnapshot(process.env.POLYGON_API_KEY);
        if (!polygonData || polygonData.length === 0) {
            console.log('No Polygon data available, skipping stock updates');
            return;
        }
        
        console.log(`Processing ${polygonData.length} stocks from Polygon`);
        
        // 批量更新股票数据
        for (const stock of polygonData.slice(0, 100)) { // 限制处理数量避免超时
            try {
                const ticker = stock.T;
                const closePrice = stock.c;
                const changePercent = ((stock.c - stock.o) / stock.o * 100).toFixed(2);
                
                // 获取Finnhub财务数据
                const finnhubData = await getFinnhubMetrics(ticker, process.env.FINNHUB_API_KEY);
                
                // 更新股票表
                await client.query(
                    `UPDATE stocks SET 
                     last_price = $1, 
                     change_percent = $2, 
                     market_cap = $3,
                     last_updated = NOW()
                     WHERE ticker = $4`,
                    [closePrice, changePercent, finnhubData?.marketCapitalization, ticker]
                );
                
            } catch (stockError) {
                console.error(`Error updating stock ${stock.T}:`, stockError.message);
                continue;
            }
        }
        
        console.log('Stock data update completed');
        
    } catch (error) {
        console.error('Stock data update failed:', error);
        throw error;
    }
}

// 更新动态标签的函数
async function updateDynamicTags(client) {
    try {
        // 获取所有有数据的股票
        const { rows: stocks } = await client.query(
            `SELECT ticker, name_zh, sector_zh, market_cap, last_price, 
             change_percent, volume, pe_ratio 
             FROM stocks 
             WHERE last_price IS NOT NULL 
             ORDER BY market_cap DESC NULLS LAST 
             LIMIT 200`
        );
        
        console.log(`Processing dynamic tags for ${stocks.length} stocks`);
        
        for (const stock of stocks) {
            try {
                // 计算动态标签
                const tags = calculateDynamicTags(stock);
                
                // 清理旧的动态标签
                await client.query(
                    `DELETE FROM stock_tags 
                     WHERE stock_ticker = $1 
                     AND tag_id IN (SELECT id FROM tags WHERE type = 'dynamic')`,
                    [stock.ticker]
                );
                
                // 应用新的动态标签
                for (const tagName of tags) {
                    await applyTagToStock(client, stock.ticker, tagName, 'dynamic');
                }
                
            } catch (tagError) {
                console.error(`Error updating tags for ${stock.ticker}:`, tagError.message);
                continue;
            }
        }
        
        console.log('Dynamic tags update completed');
        
    } catch (error) {
        console.error('Dynamic tags update failed:', error);
        throw error;
    }
}

// 计算动态标签
function calculateDynamicTags(stock) {
    const tags = [];
    
    // 基于市值的标签
    if (stock.market_cap) {
        if (stock.market_cap > 200000000000) tags.push('超大盘股');
        else if (stock.market_cap > 50000000000) tags.push('大盘股');
        else if (stock.market_cap > 10000000000) tags.push('中盘股');
        else if (stock.market_cap > 2000000000) tags.push('小盘股');
        else tags.push('微盘股');
    }
    
    // 基于价格的标签
    if (stock.last_price) {
        if (stock.last_price > 500) tags.push('高价股');
        else if (stock.last_price > 100) tags.push('中价股');
        else if (stock.last_price < 10) tags.push('低价股');
    }
    
    // 基于涨跌幅的标签
    if (stock.change_percent) {
        const change = parseFloat(stock.change_percent);
        if (change > 5) tags.push('强势上涨');
        else if (change > 2) tags.push('温和上涨');
        else if (change < -5) tags.push('大幅下跌');
        else if (change < -2) tags.push('温和下跌');
    }
    
    // 基于行业的标签
    if (stock.sector_zh) {
        tags.push(stock.sector_zh);
    }
    
    return tags;
}

// 应用标签到股票
async function applyTagToStock(client, ticker, tagName, tagType = 'dynamic') {
    try {
        // 确保标签存在
        const { rows: existingTags } = await client.query(
            'SELECT id FROM tags WHERE name = $1 AND type = $2',
            [tagName, tagType]
        );
        
        let tagId;
        if (existingTags.length > 0) {
            tagId = existingTags[0].id;
        } else {
            // 创建新标签
            const { rows: newTags } = await client.query(
                'INSERT INTO tags (name, type) VALUES ($1, $2) RETURNING id',
                [tagName, tagType]
            );
            tagId = newTags[0].id;
        }
        
        // 关联股票和标签
        await client.query(
            `INSERT INTO stock_tags (stock_ticker, tag_id) 
             VALUES ($1, $2) 
             ON CONFLICT (stock_ticker, tag_id) DO NOTHING`,
            [ticker, tagId]
        );
        
    } catch (error) {
        console.error(`Error applying tag ${tagName} to ${ticker}:`, error.message);
    }
}

// 获取Polygon快照数据
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
                if (data.results && data.results.length > 0) {
                    console.log(`[Polygon] Success! Got ${data.results.length} stocks for ${tradeDate}`);
                    return data.results;
                }
            }
        } catch (error) {
            console.log(`[Polygon] Failed for ${tradeDate}: ${error.message}`);
        }
        date.setDate(date.getDate() - 1);
    }
    return null;
}

// 获取Finnhub财务指标
async function getFinnhubMetrics(ticker, apiKey) {
    try {
        const url = `https://finnhub.io/api/v1/stock/metric?symbol=${ticker}&metric=all&token=${apiKey}`;
        const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (response.ok) {
            const data = await response.json();
            return data.metric;
        }
    } catch (error) {
        console.log(`[Finnhub] Failed for ${ticker}: ${error.message}`);
    }
    return null;
}