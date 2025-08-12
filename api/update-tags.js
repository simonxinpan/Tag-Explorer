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
                    price: quote.c,
                    dividendYield: metrics.metric?.dividendYieldAnnual,
                });
            }
        }
        console.log(`Fetched latest data for ${allStockData.length} stocks.`);

        // 3. 重新计算并应用动态标签
        // 示例：高ROE (ROE > 20%)
        const highRoeStocks = allStockData.filter(s => s.roe > 20).map(s => s.ticker);
        await applyTag('高ROE', '财务表现类', highRoeStocks, client);
         
        // 示例：52周新高 (价格在最高点的2%以内)
        const newHighStocks = allStockData.filter(s => s.price && s.high52 && s.price >= s.high52 * 0.98).map(s => s.ticker);
        await applyTag('52周新高', '股市表现类', newHighStocks, client);
         
        // 示例：高股息率 (取前50名)
        const highYieldStocks = allStockData.filter(s => s.dividendYield > 0).sort((a,b) => b.dividendYield - a.dividendYield).slice(0, 50).map(s => s.ticker);
        await applyTag('高股息率', '股市表现类', highYieldStocks, client);

        // ... 在这里可以继续添加其他动态标签的计算逻辑 ...

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