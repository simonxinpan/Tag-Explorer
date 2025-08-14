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
      'dynamic': 'bg-gradient-to-r from-blue-100 to-blue-200 text-blue-800 border-blue-300',
      '行业分类': 'bg-gradient-to-r from-green-100 to-green-200 text-green-800 border-green-300',
      '特殊名单': 'bg-gradient-to-r from-purple-100 to-purple-200 text-purple-800 border-purple-300',
      '其他': 'bg-gradient-to-r from-gray-100 to-gray-200 text-gray-800 border-gray-300'
    };
    return colors[type] || colors['其他'];
  };

  // 获取标签图标
  const getTagIcon = (type) => {
    const icons = {
      'dynamic': '📈',
      '行业分类': '🏭',
      '特殊名单': '⭐',
      '其他': '🏷️'
    };
    return icons[type] || icons['其他'];
  };

  // 获取随机动画延迟
  const getAnimationDelay = (index) => {
    return `${index * 0.1}s`;
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
            {/* 标签广场 - 主要展示区域 */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-100 rounded-2xl shadow-lg p-8">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-gray-800 mb-2">
                  🏷️ 标签广场
                </h2>
                <p className="text-gray-600">
                  发现 {tags.length} 个智能标签，探索股票集群的奥秘
                </p>
              </div>
              
              {/* 标签云展示 */}
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
                 {tags.slice(0, 12).map((tag, index) => {
                   const sizes = ['text-lg', 'text-xl', 'text-2xl'];
                   const randomSize = sizes[index % 3];
                   return (
                     <div
                       key={tag.name}
                       className="group relative overflow-hidden animate-fade-in"
                       style={{ animationDelay: getAnimationDelay(index) }}
                     >
                       <button
                         onClick={() => fetchStocksByTag(tag.name)}
                         className={`w-full p-6 rounded-xl border-2 transition-all duration-300 transform hover:scale-105 hover:shadow-xl hover:-translate-y-1 ${
                           getTagColor(tag.type)
                         } hover:border-opacity-80 group-hover:bg-opacity-90 relative overflow-hidden`}
                       >
                         <div className="text-center relative z-10">
                           <div className="text-3xl mb-3">
                             {getTagIcon(tag.type)}
                           </div>
                           <div className={`font-bold ${randomSize} mb-2 group-hover:text-opacity-90`}>
                             {tag.name}
                           </div>
                           <div className="text-sm opacity-75 mb-2 font-medium">
                             {tag.stock_count} 只股票
                           </div>
                           <div className="text-xs opacity-60 px-2 py-1 bg-white bg-opacity-30 rounded-full inline-block">
                             {tag.type || '其他'}
                           </div>
                         </div>
                         <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-0 group-hover:opacity-20 transform -skew-x-12 transition-all duration-700 group-hover:translate-x-full"></div>
                         <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                           <span className="text-xs bg-white bg-opacity-80 px-2 py-1 rounded-full">点击查看</span>
                         </div>
                       </button>
                     </div>
                   );
                 })}
              </div>

              {/* 查看更多按钮 */}
              {tags.length > 12 && (
                <div className="text-center">
                  <button
                    onClick={() => {
                      // 这里可以添加展开所有标签的逻辑
                      console.log('展开所有标签');
                    }}
                    className="px-6 py-3 bg-white text-blue-600 rounded-full font-semibold shadow-md hover:shadow-lg transition-all duration-300 hover:bg-blue-50"
                  >
                    查看全部 {tags.length} 个标签 →
                  </button>
                </div>
              )}
            </div>

            {/* 分类标签展示 */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-2xl font-semibold mb-6 text-gray-800 text-center">
                📂 按类型浏览标签
              </h3>
              
              {Object.entries(groupedTags).map(([type, typeTags]) => (
                <div key={type} className="mb-8 last:mb-0">
                   <div className="flex items-center mb-4 pb-2 border-b border-gray-200">
                     <span className="text-2xl mr-2">{getTagIcon(type)}</span>
                     <h4 className="text-lg font-medium text-gray-700 mr-3">
                       {type}
                     </h4>
                     <span className="px-3 py-1 bg-gradient-to-r from-blue-100 to-blue-200 text-blue-700 rounded-full text-sm font-medium">
                       {typeTags.length} 个标签
                     </span>
                   </div>
                   <div className="flex flex-wrap gap-3">
                     {typeTags.map((tag, tagIndex) => (
                       <button
                         key={tag.name}
                         onClick={() => fetchStocksByTag(tag.name)}
                         className={`group px-4 py-3 rounded-lg text-sm font-medium border-2 transition-all duration-200 hover:shadow-lg hover:scale-105 hover:-translate-y-1 tag-shimmer ${
                           getTagColor(tag.type)
                         }`}
                         style={{ animationDelay: `${tagIndex * 0.05}s` }}
                       >
                         <div className="flex items-center">
                           <span className="mr-2 group-hover:scale-110 transition-transform duration-200">{tag.name}</span>
                           <span className="text-xs opacity-75 bg-white bg-opacity-70 px-2 py-1 rounded-full group-hover:bg-opacity-90 transition-all duration-200">
                             {tag.stock_count}
                           </span>
                         </div>
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