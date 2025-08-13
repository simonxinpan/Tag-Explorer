import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Database, TrendingUp, Activity, Tag } from 'lucide-react';

export default function Home() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/data-health');
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('获取统计数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-16">
        {/* 头部 */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">
            Tag Explorer
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            智能股票标签系统，发现投资机会的新维度
          </p>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          <div className="bg-white rounded-xl shadow-lg p-8 text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Database className="h-8 w-8 text-blue-600" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">
              {loading ? '...' : stats?.summary?.total_stocks || 0}
            </h3>
            <p className="text-gray-600">股票数据</p>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <TrendingUp className="h-8 w-8 text-green-600" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">
              {loading ? '...' : stats?.summary?.overall_health_score || 0}%
            </h3>
            <p className="text-gray-600">数据健康度</p>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-8 text-center">
            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Tag className="h-8 w-8 text-purple-600" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">
              {loading ? '...' : Math.round(stats?.metrics?.tag_coverage?.percentage || 0)}%
            </h3>
            <p className="text-gray-600">标签覆盖率</p>
          </div>
        </div>

        {/* 功能导航 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <Link href="/admin/health" className="group">
            <div className="bg-white rounded-xl shadow-lg p-8 hover:shadow-xl transition-all duration-300 group-hover:scale-105">
              <div className="flex items-center mb-4">
                <Activity className="h-8 w-8 text-blue-600 mr-3" />
                <h3 className="text-2xl font-semibold text-gray-900">数据健康监控</h3>
              </div>
              <p className="text-gray-600 mb-4">
                实时监控股票数据质量，查看系统健康状况和性能指标
              </p>
              <div className="text-blue-600 font-medium group-hover:text-blue-700">
                进入监控台 →
              </div>
            </div>
          </Link>

          <div className="bg-white rounded-xl shadow-lg p-8 opacity-75">
            <div className="flex items-center mb-4">
              <Tag className="h-8 w-8 text-gray-400 mr-3" />
              <h3 className="text-2xl font-semibold text-gray-500">标签管理</h3>
            </div>
            <p className="text-gray-500 mb-4">
              管理股票标签，创建和编辑标签分类系统
            </p>
            <div className="text-gray-400 font-medium">
              即将推出...
            </div>
          </div>
        </div>

        {/* 底部信息 */}
        <div className="text-center mt-16">
          <p className="text-gray-500">
            Powered by Next.js & Tailwind CSS
          </p>
        </div>
      </div>
    </div>
  );
}