// 文件路径: lib/db.js

import fs from 'fs';
import path from 'path';

// 数据文件路径
const DATA_DIR = path.join(process.cwd(), 'data');
const STOCKS_FILE = path.join(DATA_DIR, 'stocks.json');
const STATS_FILE = path.join(DATA_DIR, 'update_stats.json');

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 读取数据文件
function readStocksData() {
  try {
    if (fs.existsSync(STOCKS_FILE)) {
      const data = fs.readFileSync(STOCKS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('读取股票数据失败:', error);
  }
  return [];
}

function readStatsData() {
  try {
    if (fs.existsSync(STATS_FILE)) {
      const data = fs.readFileSync(STATS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('读取统计数据失败:', error);
  }
  return [];
}

// 写入数据文件
function writeStocksData(data) {
  try {
    fs.writeFileSync(STOCKS_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('写入股票数据失败:', error);
  }
}

function writeStatsData(data) {
  try {
    fs.writeFileSync(STATS_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('写入统计数据失败:', error);
  }
}

/**
 * 模拟数据库操作工具类
 */
export class Database {
  /**
   * 获取所有股票数据
   */
  static async getStocks() {
    return readStocksData();
  }
  
  /**
   * 更新股票数据
   */
  static async updateStock(symbol, data) {
    const stocksData = readStocksData();
    const existingIndex = stocksData.findIndex(stock => stock.symbol === symbol);
    const stockData = {
      symbol,
      ...data,
      last_updated: new Date().toISOString()
    };
    
    if (existingIndex >= 0) {
      stocksData[existingIndex] = stockData;
    } else {
      stocksData.push(stockData);
    }
    
    writeStocksData(stocksData);
  }
  
  /**
   * 批量更新股票数据
   */
  static async batchUpdateStocks(stocks) {
    const stocksData = readStocksData();
    
    for (const stock of stocks) {
      const existingIndex = stocksData.findIndex(s => s.symbol === stock.symbol);
      const stockData = {
        ...stock,
        last_updated: new Date().toISOString()
      };
      
      if (existingIndex >= 0) {
        stocksData[existingIndex] = stockData;
      } else {
        stocksData.push(stockData);
      }
    }
    
    writeStocksData(stocksData);
  }
  
  /**
   * 记录更新统计
   */
  static async logUpdateStats(stats) {
    const updateStatsData = readStatsData();
    updateStatsData.push({
      id: updateStatsData.length + 1,
      ...stats,
      created_at: new Date().toISOString()
    });
    writeStatsData(updateStatsData);
  }
  
  /**
   * 获取更新统计历史
   */
  static async getUpdateStats(limit = 10) {
    const updateStatsData = readStatsData();
    return updateStatsData
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, limit);
  }
  
  /**
   * 清空所有数据（仅用于测试）
   */
  static async clearAll() {
    writeStocksData([]);
    writeStatsData([]);
  }
  
  /**
   * 获取数据统计
   */
  static async getDataStats() {
    const stocksData = readStocksData();
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const totalStocks = stocksData.length;
    const stocksWithData = stocksData.filter(stock => 
      stock.last_price && stock.change_amount !== undefined
    ).length;
    
    const recentlyUpdated = stocksData.filter(stock => 
      stock.last_updated && new Date(stock.last_updated) > oneDayAgo
    ).length;
    
    const stocksWithTags = stocksData.filter(stock => 
      stock.tags && stock.tags.length > 0
    ).length;
    
    const incompleteStocks = stocksData.filter(stock => 
      !stock.last_price || stock.change_amount === undefined || stock.change_percent === undefined
    ).length;
    
    const anomalousStocks = stocksData.filter(stock => 
      stock.last_price <= 0 || Math.abs(stock.change_percent) > 50
    ).length;
    
    const recentUpdates = await this.getUpdateStats(5);
    
    return {
      totalStocks,
      stocksWithData,
      recentlyUpdated,
      stocksWithTags,
      incompleteStocks,
      anomalousStocks,
      recentUpdates,
      completeness: totalStocks > 0 ? (stocksWithData / totalStocks) * 100 : 0,
      freshness: totalStocks > 0 ? (recentlyUpdated / totalStocks) * 100 : 0,
      tagCoverage: totalStocks > 0 ? (stocksWithTags / totalStocks) * 100 : 0,
      dataQuality: totalStocks > 0 ? ((totalStocks - anomalousStocks) / totalStocks) * 100 : 0
    };
  }
}