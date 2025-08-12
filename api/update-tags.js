// /api/update-tags.js
import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL, ssl: { rejectUnauthorized: false } });

// 辅助函数：从 Finnhub 获取最新指标和报价
async function getFinnhubData(symbol, type, apiKey) {
    let url = '';
    if (type === 'metrics') url = `https://finnhub.io/api/v1/stock/metric?symbol=${symbol}&metric=all&token=${apiKey}`;
    if (type === 'quote') url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`;
    if (!url) return null;
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

        // 2. 获取所有股票的最新数据
        const { rows: companies } = await client.query('SELECT ticker FROM stocks');
        const allStockData = [];
        for (const company of companies) {
            const metrics = await getFinnhubData(company.ticker, 'metrics', process.env.FINNHUB_API_KEY);
            const quote = await getFinnhubData(company.ticker, 'quote', process.env.FINNHUB_API_KEY);
            if (metrics && quote) {
                allStockData.push({ 
                    ticker: company.ticker, 
                    roe: metrics.metric?.roeTTM,
                    pe: metrics.metric?.peTTM,
                    high52: metrics.metric?.['52WeekHigh'],
                    low52: metrics.metric?.['52WeekLow'],
                    price: quote.c,
                    changePercent: quote.dp,
                    dividendYield: metrics.metric?.dividendYieldAnnual,
                    marketCap: metrics.metric?.marketCapitalization,
                    debtToEquity: metrics.metric?.totalDebt2TotalEquityAnnual,
                    revenueGrowth: metrics.metric?.revenueGrowthTTM,
                    beta: metrics.metric?.beta,
                    volatility: metrics.metric?.volatility1Y,
                    volumeRatio: quote.v / (metrics.metric?.avgVol10Day || 1),
                    supportLevel: metrics.metric?.['52WeekLow'] * 1.1, // 简化支撑位计算
                });
            }
        }
        console.log(`Fetched latest data for ${allStockData.length} stocks.`);

        // 3. 重新计算并应用动态标签
        
        // 📈 股市表现类
        const newHighStocks = allStockData.filter(s => s.price && s.high52 && s.price >= s.high52 * 0.98).map(s => s.ticker);
        await applyTag('52周最高', '📈 股市表现类', newHighStocks, client);
        
        const newLowStocks = allStockData.filter(s => s.price && s.low52 && s.price <= s.low52 * 1.02).map(s => s.ticker);
        await applyTag('52周最低', '📈 股市表现类', newLowStocks, client);
        
        const highYieldStocks = allStockData.filter(s => s.dividendYield > 3).sort((a,b) => b.dividendYield - a.dividendYield).slice(0, 45).map(s => s.ticker);
        await applyTag('高股息率', '📈 股市表现类', highYieldStocks, client);
        
        const lowPeStocks = allStockData.filter(s => s.pe > 0 && s.pe < 15).sort((a,b) => a.pe - b.pe).slice(0, 67).map(s => s.ticker);
        await applyTag('低市盈率', '📈 股市表现类', lowPeStocks, client);
        
        const highMarketCapStocks = allStockData.filter(s => s.marketCap > 50000000000).sort((a,b) => b.marketCap - a.marketCap).slice(0, 50).map(s => s.ticker);
        await applyTag('高市值', '📈 股市表现类', highMarketCapStocks, client);

        // 💰 财务表现类
        const highRoeStocks = allStockData.filter(s => s.roe > 15).sort((a,b) => b.roe - a.roe).slice(0, 50).map(s => s.ticker);
        await applyTag('高ROE', '💰 财务表现类', highRoeStocks, client);
        
        const lowDebtStocks = allStockData.filter(s => s.debtToEquity >= 0 && s.debtToEquity < 0.3).sort((a,b) => a.debtToEquity - b.debtToEquity).slice(0, 78).map(s => s.ticker);
        await applyTag('低负债率', '💰 财务表现类', lowDebtStocks, client);
        
        const highGrowthStocks = allStockData.filter(s => s.revenueGrowth > 0.2).sort((a,b) => b.revenueGrowth - a.revenueGrowth).slice(0, 34).map(s => s.ticker);
        await applyTag('高增长率', '💰 财务表现类', highGrowthStocks, client);
        
        const highBetaStocks = allStockData.filter(s => s.beta > 1.5).sort((a,b) => b.beta - a.beta).slice(0, 88).map(s => s.ticker);
        await applyTag('高贝塔系数', '💰 财务表现类', highBetaStocks, client);
        
        // VIX相关股票（高波动性）
        const vixRelatedStocks = allStockData.filter(s => s.beta > 2 || (s.volatility && s.volatility > 0.4)).slice(0, 5).map(s => s.ticker);
        await applyTag('VIX恐慌指数相关', '💰 财务表现类', vixRelatedStocks, client);

        // 🚀 趋势排位类
        const strongTrendStocks = allStockData.filter(s => s.changePercent > 5).sort((a,b) => b.changePercent - a.changePercent).slice(0, 30).map(s => s.ticker);
        await applyTag('近期强势', '🚀 趋势排位类', strongTrendStocks, client);
        
        const weakTrendStocks = allStockData.filter(s => s.changePercent < -5).sort((a,b) => a.changePercent - b.changePercent).slice(0, 25).map(s => s.ticker);
        await applyTag('近期弱势', '🚀 趋势排位类', weakTrendStocks, client);
        
        const highVolumeStocks = allStockData.filter(s => s.volumeRatio > 2).sort((a,b) => b.volumeRatio - a.volumeRatio).slice(0, 18).map(s => s.ticker);
        await applyTag('成交量放大', '🚀 趋势排位类', highVolumeStocks, client);
        
        const breakoutStocks = allStockData.filter(s => s.price && s.high52 && s.price >= s.high52).slice(0, 23).map(s => s.ticker);
        await applyTag('突破新高', '🚀 趋势排位类', breakoutStocks, client);
        
        const breakdownStocks = allStockData.filter(s => s.price && s.supportLevel && s.price <= s.supportLevel * 0.95).slice(0, 15).map(s => s.ticker);
        await applyTag('跌破支撑', '🚀 趋势排位类', breakdownStocks, client);

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
        const esgStocks = allStockData.filter(s => s.roe > 10 && s.debtToEquity < 0.5 && s.dividendYield > 1).sort((a,b) => b.roe - a.roe).slice(0, 89).map(s => s.ticker);
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