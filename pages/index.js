import { useState, useEffect } from 'react';
import Head from 'next/head';

export default function TagExplorer() {
  const [tags, setTags] = useState([]);
  const [stocks, setStocks] = useState([]);
  const [selectedTag, setSelectedTag] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // 获取标签数据
  const fetchTags = async () => {
    try {
      const response = await fetch('/api/tags');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setTags(data.tags || []);
    } catch (err) {
      console.error('获取标签失败:', err);
      setError('获取标签数据失败');
    }
  };

  // 获取股票数据
  const fetchStocks = async (tagName = null) => {
    try {
      const url = tagName ? `/api/tags?tag=${encodeURIComponent(tagName)}` : '/api/tags';
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setStocks(data.stocks || []);
    } catch (err) {
      console.error('获取股票失败:', err);
      setError('获取股票数据失败');
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchTags(), fetchStocks()]);
      setLoading(false);
    };
    loadData();
  }, []);

  // 处理标签点击
  const handleTagClick = async (tag) => {
    setSelectedTag(tag);
    setLoading(true);
    await fetchStocks(tag.name);
    setLoading(false);
  };

  // 清除选择
  const clearSelection = async () => {
    setSelectedTag(null);
    setLoading(true);
    await fetchStocks();
    setLoading(false);
  };

  // 按类型分组标签
  const groupedTags = tags.reduce((acc, tag) => {
    const type = tag.type || 'static';
    if (!acc[type]) acc[type] = [];
    acc[type].push(tag);
    return acc;
  }, {});

  // 获取标签颜色
  const getTagColor = (type) => {
    switch (type) {
      case 'dynamic':
        return 'bg-gradient-to-r from-blue-500 to-purple-600 text-white';
      case 'static':
        return 'bg-gradient-to-r from-green-500 to-teal-600 text-white';
      default:
        return 'bg-gradient-to-r from-gray-500 to-gray-600 text-white';
    }
  };

  if (loading && tags.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-xl mb-4">⚠️</div>
          <p className="text-red-600">{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            重新加载
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>标签广场 - Tag Explorer</title>
        <meta name="description" content="探索股票标签，发现投资机会" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
        {/* 头部 */}
        <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-6">
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  标签广场
                </h1>
                <p className="text-gray-600 mt-1">探索股票标签，发现投资机会</p>
              </div>
              {selectedTag && (
                <button
                  onClick={clearSelection}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                >
                  显示全部
                </button>
              )}
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* 当前选择 */}
          {selectedTag && (
            <div className="mb-8 p-4 bg-white rounded-xl shadow-sm border border-gray-200">
              <div className="flex items-center gap-3">
                <span className="text-gray-600">当前筛选:</span>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getTagColor(selectedTag.type)}`}>
                  {selectedTag.name}
                </span>
                <span className="text-gray-500 text-sm">({selectedTag.type === 'dynamic' ? '动态标签' : '静态标签'})</span>
              </div>
            </div>
          )}

          <div className="grid lg:grid-cols-3 gap-8">
            {/* 标签区域 */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-6">标签分类</h2>
                
                {Object.entries(groupedTags).map(([type, typeTags]) => (
                  <div key={type} className="mb-6">
                    <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                      <span className={`w-3 h-3 rounded-full ${
                        type === 'dynamic' ? 'bg-blue-500' : 'bg-green-500'
                      }`}></span>
                      {type === 'dynamic' ? '动态标签' : '静态标签'}
                      <span className="text-gray-500">({typeTags.length})</span>
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {typeTags.map((tag) => (
                        <button
                          key={tag.id}
                          onClick={() => handleTagClick(tag)}
                          className={`px-3 py-1 rounded-full text-sm font-medium transition-all duration-200 hover:scale-105 ${
                            selectedTag?.id === tag.id
                              ? getTagColor(tag.type) + ' ring-2 ring-offset-2 ring-blue-300'
                              : getTagColor(tag.type) + ' hover:shadow-md'
                          }`}
                        >
                          {tag.name}
                          {tag.stock_count && (
                            <span className="ml-1 text-xs opacity-80">({tag.stock_count})</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 股票列表区域 */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                <div className="p-6 border-b border-gray-200">
                  <h2 className="text-xl font-semibold text-gray-900">
                    {selectedTag ? `"${selectedTag.name}" 相关股票` : '所有股票'}
                    <span className="text-gray-500 text-base ml-2">({stocks.length})</span>
                  </h2>
                </div>
                
                <div className="p-6">
                  {loading ? (
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                      <p className="text-gray-600">加载中...</p>
                    </div>
                  ) : stocks.length === 0 ? (
                    <div className="text-center py-8">
                      <div className="text-gray-400 text-4xl mb-4">📊</div>
                      <p className="text-gray-600">暂无相关股票数据</p>
                    </div>
                  ) : (
                    <div className="grid gap-4">
                      {stocks.map((stock) => (
                        <div
                          key={stock.ticker}
                          className="p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <h3 className="font-semibold text-gray-900">{stock.ticker}</h3>
                                <span className="text-gray-600">{stock.name_zh || stock.name}</span>
                              </div>
                              
                              {stock.sector_zh && (
                                <p className="text-sm text-gray-600 mb-2">
                                  行业: {stock.sector_zh}
                                </p>
                              )}
                              
                              {stock.tags && stock.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {stock.tags.slice(0, 5).map((tag, index) => (
                                    <span
                                      key={index}
                                      className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full"
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                  {stock.tags.length > 5 && (
                                    <span className="px-2 py-1 bg-gray-100 text-gray-500 text-xs rounded-full">
                                      +{stock.tags.length - 5}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                            
                            <div className="text-right">
                              {stock.last_price && (
                                <div className="text-lg font-semibold text-gray-900">
                                  ${parseFloat(stock.last_price).toFixed(2)}
                                </div>
                              )}
                              {stock.change_percent && (
                                <div className={`text-sm font-medium ${
                                  parseFloat(stock.change_percent) >= 0 
                                    ? 'text-green-600' 
                                    : 'text-red-600'
                                }`}>
                                  {parseFloat(stock.change_percent) >= 0 ? '+' : ''}
                                  {parseFloat(stock.change_percent).toFixed(2)}%
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}