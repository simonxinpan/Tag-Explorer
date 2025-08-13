// 股票API模拟服务

/**
 * 获取股票基础信息
 * @param {string} symbol - 股票代码
 * @returns {Promise<Object>} 股票信息
 */
export async function getStockInfo(symbol) {
  // 模拟API调用
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        symbol,
        name: `${symbol} Company`,
        price: Math.random() * 1000 + 50,
        change: (Math.random() - 0.5) * 20,
        volume: Math.floor(Math.random() * 1000000),
        marketCap: Math.floor(Math.random() * 100000000000),
        sector: ['Technology', 'Healthcare', 'Finance', 'Energy'][Math.floor(Math.random() * 4)],
        industry: 'Software',
        lastUpdated: new Date().toISOString()
      });
    }, 100);
  });
}

/**
 * 批量获取股票信息
 * @param {string[]} symbols - 股票代码数组
 * @returns {Promise<Object[]>} 股票信息数组
 */
export async function getBatchStockInfo(symbols) {
  const promises = symbols.map(symbol => getStockInfo(symbol));
  return Promise.all(promises);
}

/**
 * 获取股票历史数据
 * @param {string} symbol - 股票代码
 * @param {string} period - 时间周期
 * @returns {Promise<Object[]>} 历史数据
 */
export async function getStockHistory(symbol, period = '1y') {
  return new Promise((resolve) => {
    setTimeout(() => {
      const data = [];
      const days = period === '1y' ? 365 : 30;
      
      for (let i = 0; i < days; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        
        data.push({
          date: date.toISOString().split('T')[0],
          open: Math.random() * 100 + 50,
          high: Math.random() * 100 + 60,
          low: Math.random() * 100 + 40,
          close: Math.random() * 100 + 50,
          volume: Math.floor(Math.random() * 1000000)
        });
      }
      
      resolve(data.reverse());
    }, 200);
  });
}

/**
 * 搜索股票
 * @param {string} query - 搜索关键词
 * @returns {Promise<Object[]>} 搜索结果
 */
export async function searchStocks(query) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const mockResults = [
        { symbol: 'AAPL', name: 'Apple Inc.' },
        { symbol: 'GOOGL', name: 'Alphabet Inc.' },
        { symbol: 'MSFT', name: 'Microsoft Corporation' },
        { symbol: 'TSLA', name: 'Tesla Inc.' },
        { symbol: 'AMZN', name: 'Amazon.com Inc.' }
      ];
      
      const filtered = mockResults.filter(stock => 
        stock.symbol.toLowerCase().includes(query.toLowerCase()) ||
        stock.name.toLowerCase().includes(query.toLowerCase())
      );
      
      resolve(filtered);
    }, 150);
  });
}

export default {
  getStockInfo,
  getBatchStockInfo,
  getStockHistory,
  searchStocks
};