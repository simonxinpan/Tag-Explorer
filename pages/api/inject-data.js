// 文件路径: pages/api/inject-data.js

import { Database } from '../../lib/db';
import { verifyApiKey } from '../../lib/auth';

/**
 * 示例股票数据
 */
const SAMPLE_STOCKS = [
  {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    last_price: 195.89,
    change_amount: 2.45,
    change_percent: 1.27,
    market_cap: 3000000000000,
    volume: 45678900,
    sector: 'Technology',
    industry: 'Consumer Electronics',
    tags: ['大盘股', '科技股', '消费电子', '创新领导者', '高分红'],
    last_updated: new Date().toISOString()
  },
  {
    symbol: 'MSFT',
    name: 'Microsoft Corporation',
    last_price: 378.85,
    change_amount: -1.23,
    change_percent: -0.32,
    market_cap: 2800000000000,
    volume: 23456789,
    sector: 'Technology',
    industry: 'Software',
    tags: ['大盘股', '科技股', '云计算', '企业软件', '稳定增长'],
    last_updated: new Date().toISOString()
  },
  {
    symbol: 'GOOGL',
    name: 'Alphabet Inc.',
    last_price: 142.56,
    change_amount: 0.89,
    change_percent: 0.63,
    market_cap: 1800000000000,
    volume: 34567890,
    sector: 'Technology',
    industry: 'Internet Services',
    tags: ['大盘股', '科技股', '搜索引擎', '广告技术', '人工智能'],
    last_updated: new Date().toISOString()
  },
  {
    symbol: 'AMZN',
    name: 'Amazon.com Inc.',
    last_price: 155.74,
    change_amount: 3.21,
    change_percent: 2.10,
    market_cap: 1600000000000,
    volume: 56789012,
    sector: 'Consumer Discretionary',
    industry: 'E-commerce',
    tags: ['大盘股', '电商', '云计算', '物流', '创新'],
    last_updated: new Date().toISOString()
  },
  {
    symbol: 'TSLA',
    name: 'Tesla Inc.',
    last_price: 248.42,
    change_amount: -5.67,
    change_percent: -2.23,
    market_cap: 800000000000,
    volume: 78901234,
    sector: 'Consumer Discretionary',
    industry: 'Electric Vehicles',
    tags: ['成长股', '电动汽车', '清洁能源', '自动驾驶', '高波动'],
    last_updated: new Date().toISOString()
  },
  {
    symbol: 'NVDA',
    name: 'NVIDIA Corporation',
    last_price: 875.28,
    change_amount: 12.45,
    change_percent: 1.44,
    market_cap: 2200000000000,
    volume: 45678901,
    sector: 'Technology',
    industry: 'Semiconductors',
    tags: ['成长股', '半导体', '人工智能', '游戏', '数据中心'],
    last_updated: new Date().toISOString()
  },
  {
    symbol: 'META',
    name: 'Meta Platforms Inc.',
    last_price: 484.52,
    change_amount: 7.89,
    change_percent: 1.66,
    market_cap: 1200000000000,
    volume: 23456789,
    sector: 'Technology',
    industry: 'Social Media',
    tags: ['大盘股', '社交媒体', '元宇宙', '广告技术', '虚拟现实'],
    last_updated: new Date().toISOString()
  },
  {
    symbol: 'NFLX',
    name: 'Netflix Inc.',
    last_price: 486.81,
    change_amount: -2.34,
    change_percent: -0.48,
    market_cap: 210000000000,
    volume: 12345678,
    sector: 'Communication Services',
    industry: 'Streaming',
    tags: ['中盘股', '流媒体', '内容制作', '订阅模式', '全球化'],
    last_updated: new Date().toISOString()
  },
  {
    symbol: 'CRM',
    name: 'Salesforce Inc.',
    last_price: 267.89,
    change_amount: 4.56,
    change_percent: 1.73,
    market_cap: 260000000000,
    volume: 8901234,
    sector: 'Technology',
    industry: 'Cloud Software',
    tags: ['大盘股', 'SaaS', '客户关系管理', '云计算', '企业软件'],
    last_updated: new Date().toISOString()
  },
  {
    symbol: 'AMD',
    name: 'Advanced Micro Devices',
    last_price: 142.67,
    change_amount: 1.89,
    change_percent: 1.34,
    market_cap: 230000000000,
    volume: 34567890,
    sector: 'Technology',
    industry: 'Semiconductors',
    tags: ['大盘股', '半导体', 'CPU', 'GPU', '数据中心'],
    last_updated: new Date().toISOString()
  }
];

/**
 * 数据注入API
 * POST /api/inject-data
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 验证API密钥（开发环境可选）
    if (process.env.NODE_ENV === 'production') {
      const authResult = verifyApiKey(req);
      if (!authResult.success) {
        return res.status(401).json({ error: authResult.error });
      }
    }

    console.log('开始注入示例数据...');
    
    // 批量插入股票数据
    await Database.batchUpdateStocks(SAMPLE_STOCKS);
    
    // 记录注入统计
    const stats = {
      update_type: 'data_injection',
      total_stocks: SAMPLE_STOCKS.length,
      successful_updates: SAMPLE_STOCKS.length,
      failed_updates: 0,
      health_score_before: 0,
      health_score_after: 85,
      duration_seconds: 2,
      created_at: new Date().toISOString()
    };
    
    await Database.logUpdateStats(stats);
    
    console.log(`成功注入 ${SAMPLE_STOCKS.length} 条股票数据`);
    
    res.status(200).json({
      success: true,
      message: `成功注入 ${SAMPLE_STOCKS.length} 条股票数据`,
      data: {
        injected_count: SAMPLE_STOCKS.length,
        stocks: SAMPLE_STOCKS.map(stock => ({
          symbol: stock.symbol,
          name: stock.name,
          tags_count: stock.tags.length
        }))
      }
    });
    
  } catch (error) {
    console.error('数据注入失败:', error);
    res.status(500).json({
      success: false,
      error: '数据注入失败',
      details: error.message
    });
  }
}