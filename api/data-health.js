// /api/data-health.js - 数据健康状况监控API
import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL, ssl: { rejectUnauthorized: false } });

export default async function handler(req, res) {
    const client = await pool.connect();
    
    try {
        console.log("Analyzing data health...");
        
        // 1. 基础统计信息
        const { rows: basicStats } = await client.query(`
            SELECT 
                COUNT(*) as total_stocks,
                COUNT(last_price) as stocks_with_price,
                COUNT(market_cap) as stocks_with_market_cap,
                COUNT(roe_ttm) as stocks_with_roe,
                COUNT(pe_ttm) as stocks_with_pe,
                COUNT(dividend_yield) as stocks_with_dividend,
                COUNT(week_52_high) as stocks_with_52w_high,
                COUNT(week_52_low) as stocks_with_52w_low,
                COUNT(change_percent) as stocks_with_change
            FROM stocks
        `);
        
        const totalStocks = parseInt(basicStats[0].total_stocks);
        
        // 2. 数据完整性分析
        const completeness = {
            price_data: (basicStats[0].stocks_with_price / totalStocks * 100).toFixed(1),
            market_cap: (basicStats[0].stocks_with_market_cap / totalStocks * 100).toFixed(1),
            roe_data: (basicStats[0].stocks_with_roe / totalStocks * 100).toFixed(1),
            pe_data: (basicStats[0].stocks_with_pe / totalStocks * 100).toFixed(1),
            dividend_data: (basicStats[0].stocks_with_dividend / totalStocks * 100).toFixed(1),
            week_52_data: (basicStats[0].stocks_with_52w_high / totalStocks * 100).toFixed(1),
            change_data: (basicStats[0].stocks_with_change / totalStocks * 100).toFixed(1)
        };
        
        // 3. 最近更新统计
        const { rows: updateStats } = await client.query(`
            SELECT 
                COUNT(CASE WHEN last_updated > NOW() - INTERVAL '1 day' THEN 1 END) as updated_today,
                COUNT(CASE WHEN last_updated > NOW() - INTERVAL '7 days' THEN 1 END) as updated_this_week,
                COUNT(CASE WHEN last_updated IS NULL THEN 1 END) as never_updated,
                MAX(last_updated) as latest_update,
                MIN(last_updated) as earliest_update
            FROM stocks
        `);
        
        // 4. 数据质量问题识别
        const { rows: qualityIssues } = await client.query(`
            SELECT 
                COUNT(CASE WHEN last_price <= 0 THEN 1 END) as negative_prices,
                COUNT(CASE WHEN market_cap <= 0 THEN 1 END) as negative_market_cap,
                COUNT(CASE WHEN pe_ttm < 0 THEN 1 END) as negative_pe,
                COUNT(CASE WHEN roe_ttm > 100 THEN 1 END) as extreme_roe,
                COUNT(CASE WHEN dividend_yield > 20 THEN 1 END) as extreme_dividend
            FROM stocks
        `);
        
        // 5. 标签统计
        const { rows: tagStats } = await client.query(`
            SELECT 
                t.type,
                COUNT(DISTINCT t.id) as tag_count,
                COUNT(st.stock_ticker) as total_associations
            FROM tags t
            LEFT JOIN stock_tags st ON t.id = st.tag_id
            GROUP BY t.type
            ORDER BY total_associations DESC
        `);
        
        // 6. 缺失数据最多的股票
        const { rows: incompleteStocks } = await client.query(`
            SELECT 
                ticker,
                name_zh,
                CASE WHEN last_price IS NULL THEN 1 ELSE 0 END +
                CASE WHEN market_cap IS NULL THEN 1 ELSE 0 END +
                CASE WHEN roe_ttm IS NULL THEN 1 ELSE 0 END +
                CASE WHEN pe_ttm IS NULL THEN 1 ELSE 0 END +
                CASE WHEN dividend_yield IS NULL THEN 1 ELSE 0 END +
                CASE WHEN week_52_high IS NULL THEN 1 ELSE 0 END +
                CASE WHEN week_52_low IS NULL THEN 1 ELSE 0 END AS missing_fields,
                last_updated
            FROM stocks
            ORDER BY missing_fields DESC, ticker
            LIMIT 20
        `);
        
        // 7. 计算数据健康评分
        const healthScore = {
            completeness_score: Math.round(
                (parseFloat(completeness.price_data) + 
                 parseFloat(completeness.market_cap) + 
                 parseFloat(completeness.roe_data) + 
                 parseFloat(completeness.pe_data)) / 4
            ),
            freshness_score: Math.round(
                (updateStats[0].updated_today / totalStocks) * 100
            ),
            quality_score: Math.round(
                100 - ((qualityIssues[0].negative_prices + 
                       qualityIssues[0].negative_market_cap + 
                       qualityIssues[0].extreme_roe) / totalStocks * 100)
            )
        };
        
        const overallScore = Math.round(
            (healthScore.completeness_score + 
             healthScore.freshness_score + 
             healthScore.quality_score) / 3
        );
        
        // 8. 生成建议
        const recommendations = [];
        
        if (parseFloat(completeness.price_data) < 90) {
            recommendations.push("价格数据覆盖率偏低，建议运行批量更新");
        }
        if (parseFloat(completeness.market_cap) < 70) {
            recommendations.push("市值数据缺失较多，建议增加Finnhub API调用频率");
        }
        if (updateStats[0].updated_today < totalStocks * 0.5) {
            recommendations.push("今日更新股票数量偏少，检查定时任务是否正常运行");
        }
        if (qualityIssues[0].negative_prices > 0) {
            recommendations.push(`发现${qualityIssues[0].negative_prices}只股票价格异常，需要数据清理\`);
        }
        
        res.status(200).json({
            success: true,
            timestamp: new Date().toISOString(),
            summary: {
                total_stocks: totalStocks,
                overall_health_score: overallScore,
                status: overallScore >= 80 ? 'healthy' : overallScore >= 60 ? 'warning' : 'critical'
            },
            data_completeness: {
                percentages: completeness,
                counts: basicStats[0]
            },
            data_freshness: {
                updated_today: updateStats[0].updated_today,
                updated_this_week: updateStats[0].updated_this_week,
                never_updated: updateStats[0].never_updated,
                latest_update: updateStats[0].latest_update,
                earliest_update: updateStats[0].earliest_update
            },
            data_quality: {
                issues: qualityIssues[0],
                health_scores: healthScore
            },
            tag_statistics: tagStats,
            most_incomplete_stocks: incompleteStocks,
            recommendations: recommendations
        });
        
    } catch (error) {
        console.error("Data health check failed:", error);
        res.status(500).json({ 
            success: false, 
            error: error.message,
            timestamp: new Date().toISOString()
        });
    } finally {
        client.release();
    }
}