// 文件路径: pages/admin/health.js

import { useState, useEffect } from 'react';
import { 
  Activity, 
  Database, 
  Clock, 
  Tag, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle, 
  RefreshCw,
  BarChart3,
  Calendar
} from 'lucide-react';

/**
 * 数据健康监控管理页面
 * 提供系统数据质量的实时监控和历史趋势分析
 */
export default function HealthMonitor() {
  const [healthData, setHealthData] = useState(null);
  const [updateStats, setUpdateStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // 获取健康数据
  const fetchHealthData = async () => {
    try {
      const response = await fetch('/api/data-health');
      if (!response.ok) {
        throw new Error('Failed to fetch health data');
      }
      const data = await response.json();
      setHealthData(data);
      setError(null);
    } catch (err) {
      setError(err.message);
      console.error('Health data fetch error:', err);
    }
  };

  // 获取更新统计
  const fetchUpdateStats = async () => {
    try {
      const response = await fetch('/api/update-stats');
      if (!response.ok) {
        throw new Error('Failed to fetch update stats');
      }
      const data = await response.json();
      setUpdateStats(data || []);
    } catch (err) {
      console.error('Update stats fetch error:', err);
    }
  };

  // 刷新数据
  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchHealthData(), fetchUpdateStats()]);
    setRefreshing(false);
  };

  // 触发手动更新
  const triggerUpdate = async (updateType) => {
    try {
      setRefreshing(true);
      const endpoint = updateType === 'batch' ? '/api/batch-update' : '/api/update-tags';
      const response = await fetch(endpoint);
      
      if (!response.ok) {
        throw new Error(`Update failed: ${response.statusText}`);
      }
      
      const result = await response.json();
      console.log('Update result:', result);
      
      // 等待几秒后刷新数据
      setTimeout(() => {
        handleRefresh();
      }, 3000);
      
    } catch (err) {
      setError(`Update failed: ${err.message}`);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchHealthData(), fetchUpdateStats()]);
      setLoading(false);
    };
    
    loadData();
    
    // 每30秒自动刷新
    const interval = setInterval(handleRefresh, 30000);
    return () => clearInterval(interval);
  }, []);

  // 获取健康状态的颜色和图标
  const getHealthStatusDisplay = (status, score) => {
    const displays = {
      excellent: { color: 'bg-green-500', icon: CheckCircle, text: '优秀' },
      good: { color: 'bg-blue-500', icon: TrendingUp, text: '良好' },
      fair: { color: 'bg-yellow-500', icon: AlertTriangle, text: '一般' },
      poor: { color: 'bg-red-500', icon: AlertTriangle, text: '较差' }
    };
    return displays[status] || displays.fair;
  };

  // 获取指标状态颜色
  const getMetricColor = (status) => {
    const colors = {
      good: 'text-green-600 bg-green-50',
      fair: 'text-yellow-600 bg-yellow-50',
      poor: 'text-red-600 bg-red-50'
    };
    return colors[status] || colors.fair;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
            <span className="ml-2 text-lg">加载健康数据中...</span>
          </div>
        </div>
      </div>
    );
  }

  const healthStatus = healthData ? getHealthStatusDisplay(
    healthData.summary.health_status, 
    healthData.summary.overall_health_score
  ) : null;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* 页面标题 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">数据健康监控</h1>
            <p className="text-gray-600 mt-1">实时监控系统数据质量和更新状态</p>
          </div>
          <div className="flex space-x-3">
            <button 
              onClick={handleRefresh} 
              disabled={refreshing}
              className="flex items-center px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              刷新
            </button>
            <button 
              onClick={() => triggerUpdate('standard')} 
              disabled={refreshing}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Activity className="h-4 w-4 mr-2" />
              标准更新
            </button>
            <button 
              onClick={() => triggerUpdate('batch')} 
              disabled={refreshing}
              className="flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
            >
              <Database className="h-4 w-4 mr-2" />
              批量更新
            </button>
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="border border-red-200 bg-red-50 p-4 rounded-lg">
            <div className="flex items-center">
              <AlertTriangle className="h-4 w-4 text-red-600 mr-2" />
              <span className="text-red-800">{error}</span>
            </div>
          </div>
        )}

        {healthData && (
          <>
            {/* 总体健康状态 */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center mb-4">
                <Activity className="h-5 w-5 mr-2" />
                <h2 className="text-xl font-semibold">总体健康状态</h2>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className={`p-3 rounded-full ${healthStatus.color}`}>
                      <healthStatus.icon className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold">
                        {healthData.summary.overall_health_score}/100
                      </div>
                      <div className="text-gray-600">{healthStatus.text}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-500">总股票数</div>
                    <div className="text-xl font-semibold">
                      {healthData.summary.total_stocks.toLocaleString()}
                    </div>
                  </div>
                </div>
                
                <div className="mt-4">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${healthData.summary.overall_health_score}%` }}
                    />
                  </div>
                </div>
                
                {healthData.summary.recommendations.length > 0 && (
                  <div className="mt-4 p-3 bg-yellow-50 rounded-lg">
                    <h4 className="font-medium text-yellow-800 mb-2">建议操作：</h4>
                    <ul className="text-sm text-yellow-700 space-y-1">
                      {healthData.summary.recommendations.map((rec, index) => (
                        <li key={index}>• {rec}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            {/* 详细指标 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* 数据完整性 */}
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center mb-3">
                  <Database className="h-4 w-4 mr-2" />
                  <h3 className="text-sm font-medium">数据完整性</h3>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold">
                      {healthData.metrics.data_completeness.rate.toFixed(1)}%
                    </span>
                    <span className={`px-2 py-1 rounded text-sm ${getMetricColor(healthData.metrics.data_completeness.status)}`}>
                      {healthData.metrics.data_completeness.status}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1">
                    <div 
                      className="bg-green-600 h-1 rounded-full transition-all duration-300"
                      style={{ width: `${healthData.metrics.data_completeness.rate}%` }}
                    />
                  </div>
                  <div className="text-xs text-gray-500">
                    完整: {healthData.metrics.data_completeness.complete_stocks.toLocaleString()} | 
                    缺失: {healthData.metrics.data_completeness.incomplete_stocks.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* 数据新鲜度 */}
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center mb-3">
                  <Clock className="h-4 w-4 mr-2" />
                  <h3 className="text-sm font-medium">数据新鲜度</h3>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold">
                      {healthData.metrics.data_freshness.rate.toFixed(1)}%
                    </span>
                    <span className={`px-2 py-1 rounded text-sm ${getMetricColor(healthData.metrics.data_freshness.status)}`}>
                      {healthData.metrics.data_freshness.status}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1">
                    <div 
                      className="bg-blue-600 h-1 rounded-full transition-all duration-300"
                      style={{ width: `${healthData.metrics.data_freshness.rate}%` }}
                    />
                  </div>
                  <div className="text-xs text-gray-500">
                    新鲜: {healthData.metrics.data_freshness.fresh_stocks.toLocaleString()} | 
                    过期: {healthData.metrics.data_freshness.stale_stocks.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* 数据质量 */}
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center mb-3">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  <h3 className="text-sm font-medium">数据质量</h3>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold">
                      {healthData.metrics.data_quality.rate.toFixed(1)}%
                    </span>
                    <span className={`px-2 py-1 rounded text-sm ${getMetricColor(healthData.metrics.data_quality.status)}`}>
                      {healthData.metrics.data_quality.status}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1">
                    <div 
                      className="bg-purple-600 h-1 rounded-full transition-all duration-300"
                      style={{ width: `${healthData.metrics.data_quality.rate}%` }}
                    />
                  </div>
                  <div className="text-xs text-gray-500">
                    正常: {healthData.metrics.data_quality.normal_stocks.toLocaleString()} | 
                    异常: {healthData.metrics.data_quality.anomalous_stocks.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* 标签覆盖率 */}
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center mb-3">
                  <Tag className="h-4 w-4 mr-2" />
                  <h3 className="text-sm font-medium">标签覆盖率</h3>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold">
                      {healthData.metrics.tag_coverage.rate.toFixed(1)}%
                    </span>
                    <span className={`px-2 py-1 rounded text-sm ${getMetricColor(healthData.metrics.tag_coverage.status)}`}>
                      {healthData.metrics.tag_coverage.status}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1">
                    <div 
                      className="bg-orange-600 h-1 rounded-full transition-all duration-300"
                      style={{ width: `${healthData.metrics.tag_coverage.rate}%` }}
                    />
                  </div>
                  <div className="text-xs text-gray-500">
                    已标记: {healthData.metrics.tag_coverage.tagged_stocks.toLocaleString()} | 
                    未标记: {healthData.metrics.tag_coverage.untagged_stocks.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            {/* 最近更新历史 */}
            {updateStats.length > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center mb-4">
                  <Calendar className="h-5 w-5 mr-2" />
                  <h2 className="text-xl font-semibold">最近更新历史</h2>
                </div>
                <div className="space-y-3">
                  {updateStats.map((stat) => (
                    <div key={stat.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <span className={`px-2 py-1 rounded text-sm ${
                          stat.update_type === 'batch' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
                        }`}>
                          {stat.update_type}
                        </span>
                        <div>
                          <div className="font-medium">
                            {stat.success_count}/{stat.total_stocks} 成功
                          </div>
                          <div className="text-sm text-gray-500">
                            {new Date(stat.created_at).toLocaleString('zh-CN')}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">{stat.duration_seconds}s</div>
                        <div className="text-sm text-gray-500">
                          {Math.round((stat.success_count / stat.total_stocks) * 100)}% 成功率
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}