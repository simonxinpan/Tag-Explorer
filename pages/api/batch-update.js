// 文件路径: pages/api/batch-update.js

import { supabase } from '../../lib/supabase';
import { verifyApiKey } from '../../lib/auth';
import { fetchStockData } from '../../lib/stock-api';
import { calculateDynamicTags } from '../../lib/tag-calculator';

/**
 * 批量数据更新API - 用于数据恢复和大规模更新
 * 当数据健康分数低于阈值时，通过GitHub Actions自动触发
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

    console.log('🚀 Starting batch update process...');
    const startTime = Date.now();
    
    // 获取所有需要更新的股票列表
    const { data: stocks, error: stocksError } = await supabase
      .from('stocks')
      .select('ticker, name_en, sector_en')
      .order('ticker');

    if (stocksError) {
      throw new Error(`Failed to fetch stocks: ${stocksError.message}`);
    }

    console.log(`📊 Found ${stocks.length} stocks to update`);

    // 批量处理配置
    const BATCH_SIZE = 20; // 每批处理20只股票
    const DELAY_BETWEEN_BATCHES = 2000; // 批次间延迟2秒
    const MAX_RETRIES = 3; // 最大重试次数

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    // 分批处理股票数据
    for (let i = 0; i < stocks.length; i += BATCH_SIZE) {
      const batch = stocks.slice(i, i + BATCH_SIZE);
      console.log(`🔄 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(stocks.length / BATCH_SIZE)}`);

      // 并行处理当前批次
      const batchPromises = batch.map(async (stock) => {
        let retries = 0;
        
        while (retries < MAX_RETRIES) {
          try {
            // 获取股票数据
            const stockData = await fetchStockData(stock.ticker);
            
            if (!stockData || !stockData.price) {
              throw new Error(`No valid data for ${stock.ticker}`);
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
            retries++;
            console.warn(`⚠️ Retry ${retries}/${MAX_RETRIES} for ${stock.ticker}: ${error.message}`);
            
            if (retries >= MAX_RETRIES) {
              errorCount++;
              errors.push({
                ticker: stock.ticker,
                error: error.message,
                retries: retries
              });
              return { ticker: stock.ticker, status: 'failed', error: error.message };
            }
            
            // 重试前等待
            await new Promise(resolve => setTimeout(resolve, 1000 * retries));
          }
        }
      });

      // 等待当前批次完成
      await Promise.all(batchPromises);
      
      // 批次间延迟，避免API限制
      if (i + BATCH_SIZE < stocks.length) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
      }
    }

    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);

    // 更新批量更新统计
    const { error: statsError } = await supabase
      .from('update_stats')
      .insert({
        update_type: 'batch',
        total_stocks: stocks.length,
        success_count: successCount,
        error_count: errorCount,
        duration_seconds: duration,
        created_at: new Date().toISOString()
      });

    if (statsError) {
      console.warn('Failed to save update stats:', statsError.message);
    }

    console.log(`✅ Batch update completed in ${duration}s`);
    console.log(`📈 Success: ${successCount}, Errors: ${errorCount}`);

    // 返回详细的更新结果
    res.status(200).json({
      success: true,
      message: 'Batch update completed',
      summary: {
        total_stocks: stocks.length,
        success_count: successCount,
        error_count: errorCount,
        success_rate: Math.round((successCount / stocks.length) * 100),
        duration_seconds: duration
      },
      errors: errors.length > 0 ? errors.slice(0, 10) : [], // 只返回前10个错误
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Batch update failed:', error);
    
    res.status(500).json({
      success: false,
      error: 'Batch update failed',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

// 导出配置
export const config = {
  api: {
    responseLimit: false, // 允许大响应
  },
};