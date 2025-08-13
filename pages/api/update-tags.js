// 文件路径: pages/api/update-tags.js

import { supabase } from '../../lib/supabase';
import { verifyApiKey } from '../../lib/auth';
import { fetchStockData } from '../../lib/stock-api';
import { calculateDynamicTags } from '../../lib/tag-calculator';

/**
 * 标准更新股票数据和动态标签的API端点
 * 由GitHub Actions定时调用，更新所有股票的最新数据
 */
export default async function handler(req, res) {
  // 只允许GET请求
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 验证API密钥
    const authResult = verifyApiKey(req);
    if (!authResult.success) {
      return res.status(401).json({ error: authResult.error });
    }

    console.log('🚀 Starting standard update...');
    const startTime = Date.now();
    
    // 获取更新前的健康分数
    let healthScoreBefore = null;
    try {
      const healthResponse = await fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/data-health`);
      if (healthResponse.ok) {
        const healthData = await healthResponse.json();
        healthScoreBefore = healthData.summary.overall_health_score;
      }
    } catch (error) {
      console.warn('Failed to get health score before update:', error.message);
    }
    
    // 获取所有股票列表
    const { data: stocks, error: stocksError } = await supabase
      .from('stocks')
      .select('ticker, name_en, sector_en')
      .order('ticker');

    if (stocksError) {
      throw new Error(`Failed to fetch stocks: ${stocksError.message}`);
    }

    console.log(`📊 Found ${stocks.length} stocks to update`);

    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    const BATCH_SIZE = 10; // 每批处理10只股票
    const DELAY_BETWEEN_REQUESTS = 150; // 请求间延迟150ms

    // 分批处理股票数据
    for (let i = 0; i < stocks.length; i += BATCH_SIZE) {
      const batch = stocks.slice(i, i + BATCH_SIZE);
      
      // 并行处理当前批次
      const batchPromises = batch.map(async (stock) => {
        try {
          // 获取最新股票数据
          const stockData = await fetchStockData(stock.ticker);
          
          if (!stockData || !stockData.price) {
            throw new Error(`No valid data returned for ${stock.ticker}`);
          }

          // 计算动态标签
          const tags = calculateDynamicTags({
            price: stockData.price,
            change_amount: stockData.change_amount,
            change_percent: stockData.change_percent,
            volume: stockData.volume,
            market_cap: stockData.market_cap,
            sector: stock.sector_en
          });

          // 更新数据库
          const { error: updateError } = await supabase
            .from('stocks')
            .update({
              price: stockData.price,
              change_amount: stockData.change_amount,
              change_percent: stockData.change_percent,
              volume: stockData.volume,
              market_cap: stockData.market_cap,
              dynamic_tags: tags,
              last_updated: new Date().toISOString()
            })
            .eq('ticker', stock.ticker);

          if (updateError) {
            throw new Error(`Database update failed: ${updateError.message}`);
          }

          successCount++;
          return { ticker: stock.ticker, status: 'success' };
          
        } catch (error) {
          errorCount++;
          errors.push({
            ticker: stock.ticker,
            error: error.message
          });
          console.error(`❌ Failed to update ${stock.ticker}:`, error.message);
          return { ticker: stock.ticker, status: 'failed', error: error.message };
        }
      });

      // 等待当前批次完成
      await Promise.all(batchPromises);
      
      // 输出进度
      console.log(`✅ Processed batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(stocks.length / BATCH_SIZE)} - Success: ${successCount}, Errors: ${errorCount}`);
      
      // 批次间延迟
      if (i + BATCH_SIZE < stocks.length) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
      }
    }

    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);

    // 获取更新后的健康分数
    let healthScoreAfter = null;
    try {
      const healthResponse = await fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/data-health`);
      if (healthResponse.ok) {
        const healthData = await healthResponse.json();
        healthScoreAfter = healthData.summary.overall_health_score;
      }
    } catch (error) {
      console.warn('Failed to get health score after update:', error.message);
    }

    // 记录更新统计
    const { error: statsError } = await supabase
      .from('update_stats')
      .insert({
        update_type: 'standard',
        total_stocks: stocks.length,
        success_count: successCount,
        error_count: errorCount,
        duration_seconds: duration,
        triggered_by: 'cron',
        trigger_reason: 'Daily scheduled update',
        health_score_before: healthScoreBefore,
        health_score_after: healthScoreAfter,
        metadata: {
          batch_size: BATCH_SIZE,
          delay_between_requests: DELAY_BETWEEN_REQUESTS,
          error_details: errors.slice(0, 10) // 保存前10个错误详情
        }
      });

    if (statsError) {
      console.warn('Failed to save update stats:', statsError.message);
    }

    console.log(`🎉 Standard update completed in ${duration} seconds`);
    console.log(`📈 Success: ${successCount}, Errors: ${errorCount}`);
    if (healthScoreBefore && healthScoreAfter) {
      console.log(`🏥 Health score: ${healthScoreBefore} → ${healthScoreAfter}`);
    }

    // 返回更新结果
    res.status(200).json({
      success: true,
      message: 'Standard stock data and tags update completed',
      summary: {
        total_stocks: stocks.length,
        success_count: successCount,
        error_count: errorCount,
        success_rate: Math.round((successCount / stocks.length) * 100),
        duration_seconds: duration,
        health_score_before: healthScoreBefore,
        health_score_after: healthScoreAfter,
        health_improvement: healthScoreBefore && healthScoreAfter ? healthScoreAfter - healthScoreBefore : null
      },
      errors: errors.length > 0 ? errors.slice(0, 5) : [], // 只返回前5个错误
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Standard update failed:', error);
    
    // 记录失败的更新统计
    try {
      await supabase
        .from('update_stats')
        .insert({
          update_type: 'standard',
          total_stocks: 0,
          success_count: 0,
          error_count: 1,
          duration_seconds: 0,
          triggered_by: 'cron',
          trigger_reason: 'Daily scheduled update - FAILED',
          metadata: {
            error_message: error.message,
            error_stack: error.stack
          }
        });
    } catch (statsError) {
      console.warn('Failed to save error stats:', statsError.message);
    }
    
    res.status(500).json({
      success: false,
      error: 'Standard update failed',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
}