// /api/update-tags.js
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

// 辅助函数：从 Finnhub 获取基本面指标（保留用于财务数据）
async function getFinnhubMetrics(symbol, apiKey) {
    const url = `https://finnhub.io/api/v1/stock/metric?symbol=${symbol}&metric=all&token=${apiKey}`;
    try {
        const res = await fetch(url);
        return res.ok ? res.json() : null;
    } catch { return null; }
}

// 辅助函数：将标签应用到一组股票
async function applyTag(tagName, tagType, tickers, client) {
    if (!tickers || tickers.length === 0) return;
    const { rows: [tag] } = await client.query(
        `INSERT INTO tags (name, type) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET type = $2 RETURNING id;`,
        [tagName, tagType]
    );
    for (const ticker of tickers) {
        await client.query(
            `INSERT INTO stock_tags (stock_ticker, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;`,
            [ticker, tag.id]
        );
    }
    console.log(`Tagged ${tickers.length} stocks with '${tagName}'.`);
}

// --- 主函数 ---
export default async function handler(req, res) {
    if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const client = await pool.connect();
    try {
        console.log("Starting daily dynamic tag update job...");
        await client.query('BEGIN');
         
        // 1. 清理所有旧的"动态"标签关联
        await client.query(`DELETE FROM stock_tags WHERE tag_id IN (SELECT id FROM tags WHERE type != '行业分类' AND type != '特殊名单类');`);
        console.log("Cleared old dynamic tags.");

        // 2. 一次性获取全市场Polygon数据
        console.log("Fetching market data from Polygon...");
        const polygonData = await getPolygonGroupedDaily(process.env.POLYGON_API_KEY);
        if (!polygonData || polygonData.length === 0) {
            throw new Error('Failed to fetch Polygon market data');
        }
        console.log(`Fetched ${polygonData.length} stocks from Polygon.`);

        // 3. 将Polygon数据转换为映射表，便于快速查找
        const polygonMap = new Map();
        polygonData.forEach(stock => {
            polygonMap.set(stock.T, { // T是ticker symbol
                open: stock.o,
                close: stock.c,
                high: stock.h,
                low: stock.l,
                volume: stock.v,
                changePercent: ((stock.c - stock.o) / stock.o * 100).toFixed(2)
            });
        });

        // 4. 获取数据库中所有股票列表
        const { rows: companies } = await client.query('SELECT ticker FROM stocks');
        console.log(`Found ${companies.length} companies in database.`);

        let marketUpdateCount = 0;
        let financialUpdateCount = 0;
        
        console.log("Starting decoupled data update process...");
        
        // 5. 解耦更新：分别处理市场数据和财务数据
        for (const company of companies) {
            const ticker = company.ticker;
            const marketData = polygonMap.get(ticker);
            
            // 5a. 如果有Polygon市场数据，立即更新市场相关字段
            if (marketData) {
                await client.query(`
                    UPDATE stocks SET 
                        current_price = $1,
                        change_percent = $2,
                        volume = $3,
                        updated_at = NOW()
                    WHERE ticker = $4
                `, [marketData.close, marketData.changePercent, marketData.volume, ticker]);
                marketUpdateCount++;
            }
            
            // 5b. 尝试获取Finnhub财务数据（允许失败）
            try {
                const financialData = await getFinnhubMetrics(ticker, process.env.FINNHUB_API_KEY);
                if (financialData && financialData.metric) {
                    await client.query(`
                        UPDATE stocks SET 
                            market_cap = $1,
                            roe = $2,
                            pe_ratio = $3,
                            dividend_yield = $4,
                            debt_to_equity = $5,
                            revenue_growth = $6,
                            beta = $7,
                            updated_at = NOW()
                        WHERE ticker = $8
                    `, [
                        financialData.metric.marketCapitalization,
                        financialData.metric.roeTTM,
                        financialData.metric.peTTM,
                        financialData.metric.dividendYieldAnnual,
                        financialData.metric.totalDebt2TotalEquityAnnual,
                        financialData.metric.revenueGrowthTTM,
                        financialData.metric.beta,
                        ticker
                    ]);
                    financialUpdateCount++;
                }
            } catch (error) {
                // 忽略单个股票的Finnhub错误，继续处理下一个
                console.warn(`Finnhub data failed for ${ticker}:`, error.message);
            }
            
            // 每处理100只股票输出一次进度
            if ((marketUpdateCount + financialUpdateCount) % 100 === 0) {
                console.log(`Progress: Market updates: ${marketUpdateCount}, Financial updates: ${financialUpdateCount}`);
            }
        }
        
        console.log(`Data update complete: Market data updated for ${marketUpdateCount} stocks, Financial data updated for ${financialUpdateCount} stocks.`);

        // 6. 获取数据库中所有股票的完整信息用于标签计算
        const { rows: allStockData } = await client.query(`
            SELECT ticker, current_price, change_percent, volume, market_cap,
                   roe, pe_ratio, dividend_yield, debt_to_equity, revenue_growth, beta
            FROM stocks 
            WHERE current_price IS NOT NULL OR market_cap IS NOT NULL
        `);
        console.log(`Processing ${allStockData.length} stocks for tag calculation.`);

        // 7. 重新计算并应用动态标签
        
        // 📈 股市表现类
        const highYieldStocks = allStockData.filter(s => s.dividend_yield > 3).sort((a,b) => b.dividend_yield - a.dividend_yield).slice(0, 45).map(s => s.ticker);
        await applyTag('高股息率', '📈 股市表现类', highYieldStocks, client);
        
        const lowPeStocks = allStockData.filter(s => s.pe_ratio > 0 && s.pe_ratio < 15).sort((a,b) => a.pe_ratio - b.pe_ratio).slice(0, 67).map(s => s.ticker);
        await applyTag('低市盈率', '📈 股市表现类', lowPeStocks, client);
        
        const highMarketCapStocks = allStockData.filter(s => s.market_cap > 50000000000).sort((a,b) => b.market_cap - a.market_cap).slice(0, 50).map(s => s.ticker);
        await applyTag('高市值', '📈 股市表现类', highMarketCapStocks, client);

        // 💰 财务表现类
        const highRoeStocks = allStockData.filter(s => s.roe > 15).sort((a,b) => b.roe - a.roe).slice(0, 50).map(s => s.ticker);
        await applyTag('高ROE', '💰 财务表现类', highRoeStocks, client);
        
        const lowDebtStocks = allStockData.filter(s => s.debt_to_equity >= 0 && s.debt_to_equity < 0.3).sort((a,b) => a.debt_to_equity - b.debt_to_equity).slice(0, 78).map(s => s.ticker);
        await applyTag('低负债率', '💰 财务表现类', lowDebtStocks, client);
        
        const highGrowthStocks = allStockData.filter(s => s.revenue_growth > 0.2).sort((a,b) => b.revenue_growth - a.revenue_growth).slice(0, 34).map(s => s.ticker);
        await applyTag('高增长率', '💰 财务表现类', highGrowthStocks, client);
        
        const highBetaStocks = allStockData.filter(s => s.beta > 1.5).sort((a,b) => b.beta - a.beta).slice(0, 88).map(s => s.ticker);
        await applyTag('高贝塔系数', '💰 财务表现类', highBetaStocks, client);
        
        // VIX相关股票（高波动性）
        const vixRelatedStocks = allStockData.filter(s => s.beta > 2).slice(0, 5).map(s => s.ticker);
        await applyTag('VIX恐慌指数相关', '💰 财务表现类', vixRelatedStocks, client);

        // 🚀 趋势排位类（基于当日涨跌幅）
        const strongTrendStocks = allStockData.filter(s => parseFloat(s.change_percent) > 5).sort((a,b) => parseFloat(b.change_percent) - parseFloat(a.change_percent)).slice(0, 30).map(s => s.ticker);
        await applyTag('近期强势', '🚀 趋势排位类', strongTrendStocks, client);
        
        const weakTrendStocks = allStockData.filter(s => parseFloat(s.change_percent) < -5).sort((a,b) => parseFloat(a.change_percent) - parseFloat(b.change_percent)).slice(0, 25).map(s => s.ticker);
        await applyTag('近期弱势', '🚀 趋势排位类', weakTrendStocks, client);
        
        // 获取平均成交量用于计算成交量放大
        const { rows: avgVolumeData } = await client.query(`
            SELECT ticker, AVG(volume) as avg_volume 
            FROM stocks 
            WHERE volume IS NOT NULL 
            GROUP BY ticker
        `);
        const avgVolumeMap = new Map(avgVolumeData.map(row => [row.ticker, row.avg_volume]));
        
        const highVolumeStocks = allStockData.filter(s => {
            const avgVol = avgVolumeMap.get(s.ticker);
            return avgVol && s.volume > avgVol * 2;
        }).sort((a,b) => b.volume - a.volume).slice(0, 18).map(s => s.ticker);
        await applyTag('成交量放大', '🚀 趋势排位类', highVolumeStocks, client);

        // 🏭 行业分类 (基于已有数据库sector字段)
        const { rows: sectorData } = await client.query(`
            SELECT sector, array_agg(ticker) as tickers, count(*) as count 
            FROM stocks WHERE sector IS NOT NULL 
            GROUP BY sector HAVING count(*) >= 10
        `);
        
        for (const sector of sectorData) {
            let sectorName = sector.sector;
            if (sectorName.includes('Technology')) sectorName = '科技股';
            else if (sectorName.includes('Financial')) sectorName = '金融股';
            else if (sectorName.includes('Healthcare')) sectorName = '医疗保健';
            else if (sectorName.includes('Energy')) sectorName = '能源股';
            else if (sectorName.includes('Consumer')) sectorName = '消费品';
            
            await applyTag(sectorName, '🏭 行业分类', sector.tickers, client);
        }

        // ⭐ 特殊名单类 (基于已有数据库index_member字段)
        const { rows: sp500 } = await client.query(`SELECT ticker FROM stocks WHERE index_member LIKE '%SP500%'`);
        await applyTag('标普500', '⭐ 特殊名单类', sp500.map(s => s.ticker), client);
        
        const { rows: nasdaq100 } = await client.query(`SELECT ticker FROM stocks WHERE index_member LIKE '%NASDAQ100%'`);
        await applyTag('纳斯达克100', '⭐ 特殊名单类', nasdaq100.map(s => s.ticker), client);
        
        const { rows: dow30 } = await client.query(`SELECT ticker FROM stocks WHERE index_member LIKE '%DOW30%'`);
        await applyTag('道琼斯', '⭐ 特殊名单类', dow30.map(s => s.ticker), client);
        
        // ESG评级高和分析师推荐 (基于财务指标)
        const esgStocks = allStockData.filter(s => s.roe > 10 && s.debt_to_equity < 0.5 && s.dividend_yield > 1).sort((a,b) => b.roe - a.roe).slice(0, 89).map(s => s.ticker);
        await applyTag('ESG评级高', '⭐ 特殊名单类', esgStocks, client);
        
        const analystRecommendStocks = allStockData.filter(s => s.pe > 0 && s.pe < 25 && s.roe > 8).sort((a,b) => b.roe - a.roe).slice(0, 120).map(s => s.ticker);
        await applyTag('分析师推荐', '⭐ 特殊名单类', analystRecommendStocks, client);

        await client.query('COMMIT');
        res.status(200).json({ success: true, message: "Dynamic tags updated successfully." });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Tag update job failed:", error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        client.release();
    }
}