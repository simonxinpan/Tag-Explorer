// /api/update-tags.js - 专门处理标签更新的API

// 计算动态标签
async function calculateDynamicTags(client, ticker, stockData) {
    const tags = [];
    
    // 基于市值的标签
    if (stockData.market_cap) {
        if (stockData.market_cap > 200000000000) tags.push('超大盘股');
        else if (stockData.market_cap > 50000000000) tags.push('大盘股');
        else if (stockData.market_cap > 10000000000) tags.push('中盘股');
        else if (stockData.market_cap > 2000000000) tags.push('小盘股');
        else tags.push('微盘股');
    }
    
    // 基于涨跌幅的标签
    if (stockData.change_percent !== null && stockData.change_percent !== undefined) {
        if (stockData.change_percent > 10) tags.push('涨停板');
        else if (stockData.change_percent > 5) tags.push('强势上涨');
        else if (stockData.change_percent > 2) tags.push('温和上涨');
        else if (stockData.change_percent > 0) tags.push('微涨');
        else if (stockData.change_percent < -10) tags.push('跌停板');
        else if (stockData.change_percent < -5) tags.push('大幅下跌');
        else if (stockData.change_percent < -2) tags.push('温和下跌');
        else if (stockData.change_percent < 0) tags.push('微跌');
        else tags.push('平盘');
    }
    
    // 基于价格的标签
    if (stockData.last_price) {
        if (stockData.last_price > 1000) tags.push('高价股');
        else if (stockData.last_price > 100) tags.push('中价股');
        else if (stockData.last_price > 10) tags.push('低价股');
        else tags.push('超低价股');
    }
    
    // 基于成交量的标签（如果有的话）
    if (stockData.volume) {
        if (stockData.volume > 100000000) tags.push('超高成交量');
        else if (stockData.volume > 50000000) tags.push('高成交量');
        else if (stockData.volume > 10000000) tags.push('中等成交量');
        else if (stockData.volume < 1000000) tags.push('低成交量');
    }
    
    // 基于行业的特殊标签
    if (stockData.sector_zh) {
        const sector = stockData.sector_zh;
        if (sector.includes('科技') || sector.includes('信息技术')) {
            tags.push('科技股');
        }
        if (sector.includes('医疗') || sector.includes('生物')) {
            tags.push('医药股');
        }
        if (sector.includes('金融') || sector.includes('银行')) {
            tags.push('金融股');
        }
        if (sector.includes('能源') || sector.includes('石油')) {
            tags.push('能源股');
        }
        if (sector.includes('消费') || sector.includes('零售')) {
            tags.push('消费股');
        }
    }
    
    return tags;
}

// 应用标签到数据库
async function applyTagsToStock(client, ticker, tags) {
    let appliedCount = 0;
    
    for (const tagName of tags) {
        try {
            // 确保标签存在
            await client.query(
                `INSERT INTO tags (name, type) VALUES ($1, 'dynamic') ON CONFLICT (name) DO NOTHING`,
                [tagName]
            );
            
            // 关联股票和标签
            const result = await client.query(
                `INSERT INTO stock_tags (stock_ticker, tag_id) 
                 SELECT $1, id FROM tags WHERE name = $2 
                 ON CONFLICT (stock_ticker, tag_id) DO NOTHING
                 RETURNING *`,
                [ticker, tagName]
            );
            
            if (result.rowCount > 0) {
                appliedCount++;
            }
        } catch (error) {
            console.warn(`Failed to apply tag ${tagName} to ${ticker}:`, error.message);
        }
    }
    
    return appliedCount;
}

// 清理旧的动态标签
async function cleanupOldDynamicTags(client, ticker) {
    try {
        const result = await client.query(
            `DELETE FROM stock_tags 
             WHERE stock_ticker = $1 
             AND tag_id IN (SELECT id FROM tags WHERE type = 'dynamic')`,
            [ticker]
        );
        return result.rowCount;
    } catch (error) {
        console.warn(`Failed to cleanup old tags for ${ticker}:`, error.message);
        return 0;
    }
}

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
    console.log("===== Starting dynamic tags update job =====");
    
    try {
        await client.query('BEGIN');
        
        // 获取所有有数据的股票
        const { rows: stocks } = await client.query(
            `SELECT ticker, name_zh, sector_zh, market_cap, last_price, 
                    change_amount, change_percent, volume, last_updated
             FROM stocks 
             WHERE last_price IS NOT NULL 
             ORDER BY market_cap DESC NULLS LAST
             LIMIT 200`
        );
        
        console.log(`Found ${stocks.length} stocks with data to process`);
        
        let processedCount = 0;
        let totalTagsApplied = 0;
        let totalTagsRemoved = 0;
        
        for (const stock of stocks) {
            try {
                // 清理旧的动态标签
                const removedTags = await cleanupOldDynamicTags(client, stock.ticker);
                totalTagsRemoved += removedTags;
                
                // 计算新的动态标签
                const newTags = await calculateDynamicTags(client, stock.ticker, stock);
                
                // 应用新标签
                const appliedTags = await applyTagsToStock(client, stock.ticker, newTags);
                totalTagsApplied += appliedTags;
                
                if (newTags.length > 0) {
                    console.log(`${stock.ticker} (${stock.name_zh}): Applied ${appliedTags} tags - ${newTags.join(', ')}`);
                }
                
                processedCount++;
                
                // 每处理10只股票暂停一下
                if (processedCount % 10 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
                
            } catch (error) {
                console.warn(`Failed to process tags for ${stock.ticker}:`, error.message);
            }
        }
        
        await client.query('COMMIT');
        
        const message = `Tags update completed. Processed ${processedCount} stocks, removed ${totalTagsRemoved} old tags, applied ${totalTagsApplied} new tags.`;
        console.log(message);
        
        res.status(200).json({
            success: true,
            message,
            stats: {
                processedStocks: processedCount,
                totalStocks: stocks.length,
                tagsRemoved: totalTagsRemoved,
                tagsApplied: totalTagsApplied
            }
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("!!!!! Tags update job FAILED !!!!!", error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        client.release();
    }
}