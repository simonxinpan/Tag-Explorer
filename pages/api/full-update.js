// /api/full-update.js - 完整数据更新（处理所有股票）
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

// 辅助函数：从 Finnhub 获取财务指标
async function getFinnhubMetrics(symbol, apiKey) {
    try {
        const res = await fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${symbol}&metric=all&token=${apiKey}`);
        return res.ok ? await res.json() : null;
    } catch { return null; }
}

// 应用标签函数
async function applyTag(tagName, tagType, tickers, client) {
    if (tickers.length === 0) return;
    
    // 1. 查找或创建标签
    let tagId;
    const { rows: existingTag } = await client.query(
        'SELECT id FROM tags WHERE name = $1', [tagName]
    );
    
    if (existingTag.length > 0) {
        tagId = existingTag[0].id;
    } else {
        const { rows: newTag } = await client.query(
            'INSERT INTO tags (name, type) VALUES ($1, $2) RETURNING id',
            [tagName, tagType]
        );
        tagId = newTag[0].id;
    }
    
    // 2. 删除该标签的所有现有关联
    await client.query('DELETE FROM stock_tags WHERE tag_id = $1', [tagId]);
    
    // 3. 批量插入新的股票-标签关联
    if (tickers.length > 0) {
        const values = tickers.map((_, i) => `($${i*2+1}, $${i*2+2})`).join(',');
        const params = tickers.flatMap(ticker => [ticker, tagId]);
        
        await client.query(`
            INSERT INTO stock_tags (stock_ticker, tag_id) 
            VALUES ${values}
        `, params);
    }
}

export default async function handler(req, res) {
    const client = await pool.connect();
    try {
        console.log("Starting full data update...");
        
        // 1. 清除所有动态标签（通过tags表的type字段）
        await client.query(`
            DELETE FROM stock_tags 
            WHERE tag_id IN (
                SELECT id FROM tags 
                WHERE type NOT IN ('行业分类', '特殊名单类')
            )
        `);
        console.log("Cleared existing dynamic tags.");
        
        // 2. 获取所有股票
        const { rows: companies } = await client.query('SELECT ticker FROM stocks');
        console.log(`Processing ${companies.length} stocks...`);

        // 3. 获取Polygon数据
        console.log("Fetching market data from Polygon...");
        const polygonData = await getPolygonGroupedDaily(process.env.POLYGON_API_KEY);
        if (!polygonData || polygonData.length === 0) {
            throw new Error('Failed to fetch Polygon market data');
        }
        console.log(`Fetched ${polygonData.length} stocks from Polygon.`);

        // 4. 将Polygon数据转换为映射表
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
        let financialUpdateCount = 0;
        
        // 5. 处理每只股票
        for (let i = 0; i < companies.length; i++) {
            const company = companies[i];
            const ticker = company.ticker;
            const marketData = polygonMap.get(ticker);
            
            // 5a. 如果有Polygon市场数据，立即更新市场相关字段
            if (marketData) {
                await client.query(`
                    UPDATE stocks SET 
                        last_price = $1,
                        change_percent = $2,
                        last_updated = NOW()
                    WHERE ticker = $3
                `, [marketData.close, marketData.changePercent, ticker]);
                marketUpdateCount++;
            }
            
            // 5b. 尝试获取Finnhub财务数据（允许失败）
            try {
                const financialData = await getFinnhubMetrics(ticker, process.env.FINNHUB_API_KEY);
                if (financialData && financialData.metric) {
                    await client.query(`
                        UPDATE stocks SET 
                            market_cap = $1,
                            roe_ttm = $2,
                            pe_ttm = $3,
                            dividend_yield = $4,
                            last_updated = NOW()
                        WHERE ticker = $5
                    `, [
                        financialData.metric.marketCapitalization,
                        financialData.metric.roeTTM,
                        financialData.metric.peTTM,
                        financialData.metric.dividendYieldAnnual,
                        ticker
                    ]);
                    financialUpdateCount++;
                }
            } catch (error) {
                // 忽略单个股票的Finnhub错误，继续处理下一个
                console.log(`Finnhub error for ${ticker}: ${error.message}`);
            }
            
            // 每处理100只股票输出一次进度
            if ((i + 1) % 100 === 0) {
                console.log(`Processed ${i + 1}/${companies.length} stocks...`);
            }
        }
        
        console.log(`Market data updated: ${marketUpdateCount} stocks`);
        console.log(`Financial data updated: ${financialUpdateCount} stocks`);
        
        // 6. 基于更新后的数据计算动态标签
        console.log("Calculating dynamic tags...");
        
        // 高增长股票 (涨幅 > 5%)
        const { rows: highGrowthStocks } = await client.query(`
            SELECT ticker FROM stocks 
            WHERE change_percent > 5 AND last_price IS NOT NULL
        `);
        await applyTag('高增长', 'dynamic', highGrowthStocks.map(r => r.ticker), client);
        
        // 价值股票 (PE < 15 且 PE > 0)
        const { rows: valueStocks } = await client.query(`
            SELECT ticker FROM stocks 
            WHERE pe_ttm < 15 AND pe_ttm > 0
        `);
        await applyTag('价值股', 'dynamic', valueStocks.map(r => r.ticker), client);
        
        // 高股息股票 (股息收益率 > 3%)
        const { rows: highDividendStocks } = await client.query(`
            SELECT ticker FROM stocks 
            WHERE dividend_yield > 3
        `);
        await applyTag('高股息', 'dynamic', highDividendStocks.map(r => r.ticker), client);
        
        // 大盘股 (市值 > 100亿)
        const { rows: largeCaps } = await client.query(`
            SELECT ticker FROM stocks 
            WHERE market_cap > 10000
        `);
        await applyTag('大盘股', 'dynamic', largeCaps.map(r => r.ticker), client);
        
        console.log(`Applied dynamic tags: 高增长(${highGrowthStocks.length}), 价值股(${valueStocks.length}), 高股息(${highDividendStocks.length}), 大盘股(${largeCaps.length})`);
        
        res.status(200).json({
            success: true,
            message: `Full update completed successfully.`,
            stats: {
                totalStocks: companies.length,
                marketDataUpdated: marketUpdateCount,
                financialDataUpdated: financialUpdateCount,
                polygonDataCount: polygonData.length,
                tags: {
                    highGrowth: highGrowthStocks.length,
                    value: valueStocks.length,
                    highDividend: highDividendStocks.length,
                    largeCap: largeCaps.length
                }
            }
        });
    } catch (error) {
        console.error("Full update failed:", error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        client.release();
    }
}