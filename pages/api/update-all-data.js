// /api/update-all-data.js - 统一的数据更新和标签计算API
import { Pool } from 'pg';

// 检查是否应该使用模拟数据
function shouldUseMockData() {
    const dbUrl = process.env.NEON_DATABASE_URL;
    return !dbUrl || dbUrl.includes('your-database-url') || dbUrl.includes('placeholder');
}

const pool = shouldUseMockData() ? null : new Pool({
    connectionString: process.env.NEON_DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

// --- 辅助函数 1: 从 Polygon 高效获取全市场快照 ---
async function getPolygonSnapshot(apiKey) {
    try {
        const response = await fetch(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apikey=${apiKey}`);
        if (!response.ok) {
            throw new Error(`Polygon API error: ${response.status}`);
        }
        const data = await response.json();
        
        const snapshot = new Map();
        if (data.results && Array.isArray(data.results)) {
            data.results.forEach(ticker => {
                if (ticker.value && ticker.value.c && ticker.value.o) {
                    snapshot.set(ticker.ticker, {
                        c: ticker.value.c,  // 收盘价
                        o: ticker.value.o,  // 开盘价
                        h: ticker.value.h,  // 最高价
                        l: ticker.value.l,  // 最低价
                        v: ticker.value.v   // 成交量
                    });
                }
            });
        }
        console.log(`Polygon snapshot: ${snapshot.size} tickers fetched`);
        return snapshot;
    } catch (error) {
        console.error('Error fetching Polygon snapshot:', error);
        return new Map();
    }
}

// --- 辅助函数 2: 从 Finnhub 获取单只股票的财务指标 ---
async function getFinnhubMetrics(symbol, apiKey) {
    try {
        const response = await fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${symbol}&metric=all&token=${apiKey}`);
        if (!response.ok) {
            if (response.status === 429) {
                console.warn(`Rate limit hit for ${symbol}, skipping...`);
                return null;
            }
            throw new Error(`Finnhub API error: ${response.status}`);
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error fetching Finnhub data for ${symbol}:`, error.message);
        return null;
    }
}

// --- 辅助函数 3: 应用标签 ---
async function applyTag(tagName, tagType, tickers, client) {
    if (!tickers || tickers.length === 0) {
        console.log(`No stocks qualify for tag: ${tagName}`);
        return;
    }
    
    try {
        // 确保标签存在
        const { rows: existingTags } = await client.query(
            'SELECT id FROM tags WHERE name = $1',
            [tagName]
        );
        
        let tagId;
        if (existingTags.length > 0) {
            tagId = existingTags[0].id;
        } else {
            const { rows: newTag } = await client.query(
                'INSERT INTO tags (name, type) VALUES ($1, $2) RETURNING id',
                [tagName, tagType]
            );
            tagId = newTag[0].id;
        }
        
        // 批量插入股票标签关联
        for (const ticker of tickers) {
            await client.query(
                'INSERT INTO stock_tags (stock_ticker, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                [ticker, tagId]
            );
        }
        
        console.log(`Applied tag "${tagName}" to ${tickers.length} stocks`);
    } catch (error) {
        console.error(`Error applying tag ${tagName}:`, error.message);
    }
}

// --- 辅助函数 4: 计算市值分类标签 ---
async function calculateMarketCapTags(allStocks, client) {
    const validStocks = allStocks.filter(s => s.market_cap && s.market_cap > 0);
    if (validStocks.length === 0) return;
    
    // 按市值排序
    validStocks.sort((a, b) => b.market_cap - a.market_cap);
    
    const total = validStocks.length;
    const largeCapCount = Math.floor(total * 0.3);  // 前30%为大盘股
    const midCapCount = Math.floor(total * 0.4);    // 中间40%为中盘股
    
    const largeCapStocks = validStocks.slice(0, largeCapCount).map(s => s.ticker);
    const midCapStocks = validStocks.slice(largeCapCount, largeCapCount + midCapCount).map(s => s.ticker);
    const smallCapStocks = validStocks.slice(largeCapCount + midCapCount).map(s => s.ticker);
    
    await applyTag('大盘股', 'dynamic', largeCapStocks, client);
    await applyTag('中盘股', 'dynamic', midCapStocks, client);
    await applyTag('小盘股', 'dynamic', smallCapStocks, client);
}

// --- 辅助函数 5: 计算价格分类标签 ---
async function calculatePriceTags(allStocks, client) {
    const validStocks = allStocks.filter(s => s.last_price && s.last_price > 0);
    if (validStocks.length === 0) return;
    
    const highPriceStocks = validStocks.filter(s => s.last_price >= 200).map(s => s.ticker);
    const midPriceStocks = validStocks.filter(s => s.last_price >= 50 && s.last_price < 200).map(s => s.ticker);
    const lowPriceStocks = validStocks.filter(s => s.last_price < 50).map(s => s.ticker);
    
    await applyTag('高价股', 'dynamic', highPriceStocks, client);
    await applyTag('中价股', 'dynamic', midPriceStocks, client);
    await applyTag('低价股', 'dynamic', lowPriceStocks, client);
}

// --- 辅助函数 6: 计算涨跌幅标签 ---
async function calculateChangeTags(allStocks, client) {
    const validStocks = allStocks.filter(s => s.change_percent !== null && s.change_percent !== undefined);
    if (validStocks.length === 0) return;
    
    const strongUpStocks = validStocks.filter(s => s.change_percent >= 5).map(s => s.ticker);
    const mildUpStocks = validStocks.filter(s => s.change_percent > 0 && s.change_percent < 5).map(s => s.ticker);
    const mildDownStocks = validStocks.filter(s => s.change_percent < 0 && s.change_percent >= -5).map(s => s.ticker);
    const strongDownStocks = validStocks.filter(s => s.change_percent < -5).map(s => s.ticker);
    
    await applyTag('强势上涨', 'dynamic', strongUpStocks, client);
    await applyTag('温和上涨', 'dynamic', mildUpStocks, client);
    await applyTag('温和下跌', 'dynamic', mildDownStocks, client);
    await applyTag('大幅下跌', 'dynamic', strongDownStocks, client);
}

// --- API 主处理函数 ---
export default async function handler(req, res) {
    // 安全校验
    if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }



    // 检查是否使用模拟模式
    if (shouldUseMockData() || !pool) {
        console.log("Using mock mode - database not configured");
        return res.status(200).json({ 
            success: true, 
            message: "Mock mode: All data and tags updated successfully (simulated)",
            mode: "mock",
            timestamp: new Date().toISOString()
        });
    }

    let client;
    try {
        client = await pool.connect();
    } catch (error) {
        console.log("Database connection failed, using mock mode:", error.message);
        return res.status(200).json({ 
            success: true, 
            message: "Mock mode: Database connection failed, simulated update completed",
            mode: "mock",
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
    console.log("===== Starting unified data injection & tag update job =====");
    
    try {
        await client.query('BEGIN');
        
        // Step 1: 获取所有股票列表
        const { rows: companies } = await client.query('SELECT ticker FROM stocks');
        console.log(`Step 1: Found ${companies.length} companies in DB.`);

        // Step 2: 并行获取 Polygon 市场快照 和 Finnhub 财务指标
        console.log("Step 2: Fetching data from Polygon (market) and Finnhub (financials)...");
        const polygonSnapshot = await getPolygonSnapshot(process.env.POLYGON_API_KEY);
        
        let successUpdateCount = 0;
        for (const company of companies) {
            const ticker = company.ticker;
            // 为了避免短时间请求过多Finnhub，我们加入一个微小的延迟
            await new Promise(resolve => setTimeout(resolve, 100)); // 100毫秒延迟
            
            const marketData = polygonSnapshot.get(ticker);
            const financialData = await getFinnhubMetrics(ticker, process.env.FINNHUB_API_KEY);
            
            const updates = {}; 
            const values = []; 
            let queryIndex = 1;
            
            // 更新市场数据
            if (marketData) {
                updates.last_price = `$${queryIndex++}`; 
                values.push(marketData.c);
                if (marketData.o > 0) {
                    updates.change_percent = `$${queryIndex++}`; 
                    values.push(((marketData.c - marketData.o) / marketData.o) * 100);
                }
                updates.volume = `$${queryIndex++}`;
                values.push(marketData.v);
            }
            
            // 更新财务数据
            if (financialData && financialData.metric) {
                const metric = financialData.metric;
                if (metric.marketCapitalization) {
                    updates.market_cap = `$${queryIndex++}`; 
                    values.push(metric.marketCapitalization * 1000000); // Finnhub返回的是百万美元单位
                }
                if (metric.roeTTM) {
                    updates.roe_ttm = `$${queryIndex++}`; 
                    values.push(metric.roeTTM);
                }
                if (metric.peTTM) {
                    updates.pe_ttm = `$${queryIndex++}`; 
                    values.push(metric.peTTM);
                }
                if (metric['52WeekHigh']) {
                    updates.week_52_high = `$${queryIndex++}`; 
                    values.push(metric['52WeekHigh']);
                }
                if (metric['52WeekLow']) {
                    updates.week_52_low = `$${queryIndex++}`; 
                    values.push(metric['52WeekLow']);
                }
                if (metric.dividendYieldAnnual) {
                    updates.dividend_yield = `$${queryIndex++}`; 
                    values.push(metric.dividendYieldAnnual);
                }
            }
            
            // 执行更新
            if (Object.keys(updates).length > 0) {
                updates.last_updated = 'NOW()';
                const setClauses = Object.keys(updates).map(key => `${key} = ${updates[key]}`).join(', ');
                await client.query(
                    `UPDATE stocks SET ${setClauses} WHERE ticker = $${queryIndex}`, 
                    [...values, ticker]
                );
                successUpdateCount++;
            }
        }
        console.log(`Step 2 Complete: Updated data for ${successUpdateCount} stocks.`);

        // Step 3: 清理并重新计算动态标签
        console.log("Step 3: Recalculating dynamic tags...");
        await client.query(`DELETE FROM stock_tags WHERE tag_id IN (SELECT id FROM tags WHERE type = 'dynamic');`);
        
        // 获取所有股票数据用于标签计算
        const { rows: allStocks } = await client.query(
            'SELECT ticker, roe_ttm, week_52_high, week_52_low, last_price, change_percent, market_cap, pe_ttm, dividend_yield FROM stocks'
        );
        
        // 计算各种动态标签
        await calculateMarketCapTags(allStocks, client);
        await calculatePriceTags(allStocks, client);
        await calculateChangeTags(allStocks, client);
        
        // 计算财务表现标签
        const highRoeStocks = allStocks.filter(s => s.roe_ttm && s.roe_ttm > 20).map(s => s.ticker);
        await applyTag('高ROE', 'dynamic', highRoeStocks, client);
        
        const lowPeStocks = allStocks.filter(s => s.pe_ttm && s.pe_ttm > 0 && s.pe_ttm < 15).map(s => s.ticker);
        await applyTag('低市盈率', 'dynamic', lowPeStocks, client);
        
        const highDividendStocks = allStocks.filter(s => s.dividend_yield && s.dividend_yield > 3).map(s => s.ticker);
        await applyTag('高股息', 'dynamic', highDividendStocks, client);
        
        // 计算技术指标标签
        const newHighStocks = allStocks.filter(s => 
            s.last_price && s.week_52_high && s.last_price >= s.week_52_high * 0.98
        ).map(s => s.ticker);
        await applyTag('52周新高', 'dynamic', newHighStocks, client);
        
        const newLowStocks = allStocks.filter(s => 
            s.last_price && s.week_52_low && s.last_price <= s.week_52_low * 1.02
        ).map(s => s.ticker);
        await applyTag('52周新低', 'dynamic', newLowStocks, client);
        
        console.log("Step 3 Complete: Dynamic tags recalculated.");
        
        await client.query('COMMIT');
        
        const response = {
            success: true,
            message: `Unified update completed successfully.`,
            stats: {
                stocksUpdated: successUpdateCount,
                totalStocks: companies.length,
                tagsRecalculated: true
            },
            timestamp: new Date().toISOString()
        };
        
        console.log("===== Job completed successfully =====", response.stats);
        res.status(200).json(response);
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("!!!!! Unified job FAILED !!!!!", error);
        res.status(500).json({ 
            success: false, 
            error: error.message,
            timestamp: new Date().toISOString()
        });
    } finally {
        client.release();
    }
}