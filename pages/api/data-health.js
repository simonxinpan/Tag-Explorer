// 文件路径: pages/api/data-health.js

import { Database } from '../../lib/db';

/**
 * 数据健康监控API
 * 评估数据库中股票数据的完整性、新鲜度和质量
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🔍 Starting data health check...');
    const startTime = Date.now();

    // 1. 基础数据统计
    const stats = await Database.getDataStats();
    const totalCount = stats.totalStocks;

    // 2. 检查数据完整性
    const incompleteCount = stats.incompleteStocks;
    const completenessRate = stats.completeness;

    // 3. 检查数据新鲜度（24小时内更新的数据）
    const freshCount = stats.recentlyUpdated;
    const freshnessRate = stats.freshness;

    // 4. 检查动态标签覆盖率
    const taggedCount = stats.stocksWithTags;
    const tagCoverageRate = stats.tagCoverage;

    // 5. 检查异常数据（价格为0或负数）
    const anomalousCount = stats.anomalousStocks;
    const dataQualityRate = stats.dataQuality;

    // 6. 获取最近的更新统计
    const recentUpdates = stats.recentUpdates || [];

    // 7. 计算综合健康分数
    const weights = {
      completeness: 0.3,    // 数据完整性权重30%
      freshness: 0.3,       // 数据新鲜度权重30%
      quality: 0.25,        // 数据质量权重25%
      tagCoverage: 0.15     // 标签覆盖率权重15%
    };

    const overallHealthScore = Math.round(
      completenessRate * weights.completeness +
      freshnessRate * weights.freshness +
      dataQualityRate * weights.quality +
      tagCoverageRate * weights.tagCoverage
    );

    // 8. 确定健康状态
    let healthStatus;
    let recommendations = [];

    if (overallHealthScore >= 90) {
      healthStatus = 'excellent';
    } else if (overallHealthScore >= 75) {
      healthStatus = 'good';
    } else if (overallHealthScore >= 60) {
      healthStatus = 'fair';
      recommendations.push('Consider running batch update to improve data quality');
    } else {
      healthStatus = 'poor';
      recommendations.push('Immediate batch update recommended');
      recommendations.push('Check data source connectivity');
    }

    // 添加具体建议
    if (completenessRate < 95) {
      recommendations.push(`Data completeness is ${completenessRate.toFixed(1)}% - some stocks missing core data`);
    }
    if (freshnessRate < 80) {
      recommendations.push(`Data freshness is ${freshnessRate.toFixed(1)}% - many stocks not updated recently`);
    }
    if (tagCoverageRate < 90) {
      recommendations.push(`Tag coverage is ${tagCoverageRate.toFixed(1)}% - run tag update process`);
    }
    if (anomalousCount > 0) {
      recommendations.push(`${anomalousCount} stocks have anomalous data - review data quality`);
    }

    const endTime = Date.now();
    const checkDuration = endTime - startTime;

    console.log(`✅ Data health check completed in ${checkDuration}ms`);
    console.log(`📊 Overall health score: ${overallHealthScore}/100 (${healthStatus})`);

    // 返回详细的健康报告
    res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      check_duration_ms: checkDuration,
      summary: {
        overall_health_score: overallHealthScore,
        health_status: healthStatus,
        total_stocks: totalCount,
        recommendations: recommendations
      },
      metrics: {
        data_completeness: {
          rate: Math.round(completenessRate * 100) / 100,
          complete_stocks: totalCount - incompleteCount,
          incomplete_stocks: incompleteCount,
          status: completenessRate >= 95 ? 'good' : completenessRate >= 85 ? 'fair' : 'poor'
        },
        data_freshness: {
          rate: Math.round(freshnessRate * 100) / 100,
          fresh_stocks: freshCount,
          stale_stocks: totalCount - freshCount,
          status: freshnessRate >= 80 ? 'good' : freshnessRate >= 60 ? 'fair' : 'poor'
        },
        data_quality: {
          rate: Math.round(dataQualityRate * 100) / 100,
          normal_stocks: totalCount - anomalousCount,
          anomalous_stocks: anomalousCount,
          status: dataQualityRate >= 95 ? 'good' : dataQualityRate >= 85 ? 'fair' : 'poor'
        },
        tag_coverage: {
          rate: Math.round(tagCoverageRate * 100) / 100,
          tagged_stocks: taggedCount,
          untagged_stocks: totalCount - taggedCount,
          status: tagCoverageRate >= 90 ? 'good' : tagCoverageRate >= 75 ? 'fair' : 'poor'
        }
      },
      recent_updates: recentUpdates || [],
      weights: weights
    });

  } catch (error) {
    console.error('❌ Data health check failed:', error);
    
    res.status(500).json({
      success: false,
      error: 'Data health check failed',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
}