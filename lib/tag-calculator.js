// 标签计算和分析服务

/**
 * 计算股票标签
 * @param {Object} stockData - 股票数据
 * @returns {string[]} 标签数组
 */
export function calculateStockTags(stockData) {
  const tags = [];
  
  if (!stockData) return tags;
  
  // 基于价格的标签
  if (stockData.price) {
    if (stockData.price > 1000) tags.push('高价股');
    else if (stockData.price < 10) tags.push('低价股');
    else tags.push('中价股');
  }
  
  // 基于变化的标签
  if (stockData.change) {
    if (stockData.change > 5) tags.push('大涨');
    else if (stockData.change > 0) tags.push('上涨');
    else if (stockData.change < -5) tags.push('大跌');
    else if (stockData.change < 0) tags.push('下跌');
    else tags.push('平盘');
  }
  
  // 基于成交量的标签
  if (stockData.volume) {
    if (stockData.volume > 1000000) tags.push('高成交量');
    else if (stockData.volume < 100000) tags.push('低成交量');
    else tags.push('正常成交量');
  }
  
  // 基于市值的标签
  if (stockData.marketCap) {
    if (stockData.marketCap > 100000000000) tags.push('大盘股');
    else if (stockData.marketCap > 10000000000) tags.push('中盘股');
    else tags.push('小盘股');
  }
  
  // 基于行业的标签
  if (stockData.sector) {
    tags.push(stockData.sector);
  }
  
  if (stockData.industry) {
    tags.push(stockData.industry);
  }
  
  return tags;
}

/**
 * 批量计算股票标签
 * @param {Object[]} stocksData - 股票数据数组
 * @returns {Object[]} 带标签的股票数据
 */
export function calculateBatchTags(stocksData) {
  return stocksData.map(stock => ({
    ...stock,
    tags: calculateStockTags(stock)
  }));
}

/**
 * 分析标签分布
 * @param {Object[]} stocksData - 股票数据数组
 * @returns {Object} 标签统计
 */
export function analyzeTagDistribution(stocksData) {
  const tagCounts = {};
  const totalStocks = stocksData.length;
  
  stocksData.forEach(stock => {
    if (stock.tags && Array.isArray(stock.tags)) {
      stock.tags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    }
  });
  
  // 计算标签覆盖率
  const taggedStocks = stocksData.filter(stock => 
    stock.tags && stock.tags.length > 0
  ).length;
  
  const coverage = totalStocks > 0 ? (taggedStocks / totalStocks) * 100 : 0;
  
  // 排序标签
  const sortedTags = Object.entries(tagCounts)
    .sort(([,a], [,b]) => b - a)
    .map(([tag, count]) => ({
      tag,
      count,
      percentage: (count / totalStocks) * 100
    }));
  
  return {
    totalStocks,
    taggedStocks,
    coverage,
    uniqueTags: Object.keys(tagCounts).length,
    tagDistribution: sortedTags,
    topTags: sortedTags.slice(0, 10)
  };
}

/**
 * 推荐相关标签
 * @param {string} tag - 当前标签
 * @param {Object[]} stocksData - 股票数据数组
 * @returns {string[]} 相关标签
 */
export function getRelatedTags(tag, stocksData) {
  const relatedTags = {};
  
  stocksData.forEach(stock => {
    if (stock.tags && stock.tags.includes(tag)) {
      stock.tags.forEach(otherTag => {
        if (otherTag !== tag) {
          relatedTags[otherTag] = (relatedTags[otherTag] || 0) + 1;
        }
      });
    }
  });
  
  return Object.entries(relatedTags)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([tag]) => tag);
}

/**
 * 验证标签质量
 * @param {Object[]} stocksData - 股票数据数组
 * @returns {Object} 质量报告
 */
export function validateTagQuality(stocksData) {
  let totalTags = 0;
  let validTags = 0;
  let duplicateTags = 0;
  const tagFrequency = {};
  
  stocksData.forEach(stock => {
    if (stock.tags && Array.isArray(stock.tags)) {
      const uniqueTags = new Set();
      
      stock.tags.forEach(tag => {
        totalTags++;
        
        // 检查标签是否有效（非空字符串）
        if (typeof tag === 'string' && tag.trim().length > 0) {
          validTags++;
          
          // 检查重复标签
          if (uniqueTags.has(tag)) {
            duplicateTags++;
          } else {
            uniqueTags.add(tag);
          }
          
          // 统计标签频率
          tagFrequency[tag] = (tagFrequency[tag] || 0) + 1;
        }
      });
    }
  });
  
  const qualityScore = totalTags > 0 ? (validTags / totalTags) * 100 : 0;
  
  return {
    totalTags,
    validTags,
    duplicateTags,
    qualityScore,
    recommendations: [
      ...(duplicateTags > 0 ? ['清理重复标签'] : []),
      ...(qualityScore < 90 ? ['提高标签质量'] : []),
      ...(Object.keys(tagFrequency).length < 10 ? ['增加标签多样性'] : [])
    ]
  };
}

export default {
  calculateStockTags,
  calculateBatchTags,
  analyzeTagDistribution,
  getRelatedTags,
  validateTagQuality
};