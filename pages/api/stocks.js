// 文件路径: pages/api/stocks.js

import { Database } from '../../lib/db';

/**
 * 股票数据API
 * GET /api/stocks - 获取所有股票数据
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const stocks = await Database.getStocks();
    
    res.status(200).json({
      success: true,
      data: stocks,
      count: stocks.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('获取股票数据失败:', error);
    res.status(500).json({
      success: false,
      error: '获取股票数据失败',
      details: error.message
    });
  }
}