import { useState, useEffect } from 'react';
import Head from 'next/head';

export default function Home() {
  const [tags, setTags] = useState([]);
  const [selectedTag, setSelectedTag] = useState(null);
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // 获取所有标签
  useEffect(() => {
    fetchTags();
  }, []);

  const fetchTags = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/tags');
      if (!response.ok) throw new Error('Failed to fetch tags');
      const data = await response.json();
      setTags(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 获取特定标签的股票
  const fetchStocksByTag = async (tagName) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/tags?tag_name=${encodeURIComponent(tagName)}`);
      if (!response.ok) throw new Error('Failed to fetch stocks');
      const data = await response.json();
      setStocks(data);
      setSelectedTag(tagName);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 按类型分组标签
  const groupedTags = tags.reduce((acc, tag) => {
    const type = tag.type || '其他';
    if (!acc[type]) acc[type] = [];
    acc[type].push(tag);
    return acc;
  }, {});

  // 获取标签颜色
  const getTagColor = (type) => {
    const colors = {
      'dynamic': 'bg-blue-100 text-blue-800 border-blue-200',
      '行业分类': 'bg-green-100 text-green-800 border-green-200',
      '特殊名单': 'bg-purple-100 text-purple-800 border-purple-200',
      '其他': 'bg-gray-100 text-gray-800 border-gray-200'
    };
    return colors[type] || colors['其他'];
  };

  // 格式化涨跌幅
  const formatChangePercent = (change) => {
    if (change === null || change === undefined) return 'N/A';
    const formatted = change.toFixed(2);
    const color = change >= 0 ? 'text-green-600' : 'text-red-600';
    const sign = change >= 0 ? '+' : '';
    return <span className={color}>{sign}{formatted}%</span>;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>Tag Explorer - 智能股票标签系统</title>
        <meta name="description" content="智能股票标签系统，发现股票集群" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            🏷️ Tag Explorer
          </h1>
          <p className="text-xl text-gray-600">
            智能股票标签系统 - 发现股票集群的新方式
          </p>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
            错误: {error}
          </div>
        )}

        {loading && (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-600">加载中...</p>
          </div>
        )}

        {!selectedTag && !loading && (
          <div className="space-y-8">
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-2xl font-semibold mb-4 text-gray-800">
                📊 标签总览 ({tags.length} 个标签)
              </h2>
              
              {Object.entries(groupedTags).map(([type, typeTags]) => (
                <div key={type} className="mb-6">
                  <h3 className="text-lg font-medium mb-3 text-gray-700">
                    {type} ({typeTags.length} 个)
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {typeTags.map((tag) => (
                      <button
                        key={tag.name}
                        onClick={() => fetchStocksByTag(tag.name)}
                        className={`px-3 py-2 rounded-full text-sm font-medium border transition-all hover:shadow-md ${
                          getTagColor(tag.type)
                        }`}
                      >
                        {tag.name}
                        <span className="ml-1 text-xs opacity-75">
                          ({tag.stock_count})
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-2xl font-semibold mb-4 text-gray-800">
                🚀 动态标签系统特色
              </h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <h3 className="font-semibold text-blue-800 mb-2">📈 实时市场数据</h3>
                  <p className="text-sm text-blue-600">
                    基于最新的股价、市值、涨跌幅等数据自动生成标签
                  </p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg">
                  <h3 className="font-semibold text-green-800 mb-2">🏭 行业分类</h3>
                  <p className="text-sm text-green-600">
                    智能识别股票所属行业，便于行业对比分析
                  </p>
                </div>
                <div className="p-4 bg-purple-50 rounded-lg">
                  <h3 className="font-semibold text-purple-800 mb-2">⭐ 特殊名单</h3>
                  <p className="text-sm text-purple-600">
                    标普500、纳斯达克100等重要指数成分股
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {selectedTag && !loading && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-semibold text-gray-800">
                标签: {selectedTag} ({stocks.length} 只股票)
              </h2>
              <button
                onClick={() => {
                  setSelectedTag(null);
                  setStocks([]);
                }}
                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
              >
                返回标签列表
              </button>
            </div>

            {stocks.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full table-auto">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                        股票代码
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                        公司名称
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                        涨跌幅
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {stocks.map((stock, index) => (
                      <tr key={stock.ticker} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">
                          {stock.ticker}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {stock.name_zh || 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {formatChangePercent(stock.change_percent)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">
                该标签下暂无股票数据
              </p>
            )}
          </div>
        )}
      </main>

      <footer className="bg-gray-800 text-white py-8 mt-12">
        <div className="container mx-auto px-4 text-center">
          <p className="text-gray-300">
            © 2024 Tag Explorer - 智能股票标签系统
          </p>
          <p className="text-sm text-gray-400 mt-2">
            数据每日自动更新，标签基于最新市场数据生成
          </p>
        </div>
      </footer>
    </div>
  );
}