# 数据健康监控与批量更新系统

## 概述

本系统为Tag-Explorer项目提供了全面的数据健康监控和智能批量更新功能，确保股票数据的高质量和系统的稳定运行。

## 🏥 数据健康监控系统

### 核心功能

#### 1. 多维度健康评估
- **数据完整性** (30%权重): 检查股票价格、变化量等核心字段的完整性
- **数据新鲜度** (30%权重): 评估24小时内更新的数据比例
- **数据质量** (25%权重): 识别异常数据（如负价格、极端变化）
- **标签覆盖率** (15%权重): 检查动态标签的覆盖情况

#### 2. 智能健康分数
- 综合评分：0-100分
- 健康状态分级：
  - 🟢 优秀 (90-100分)
  - 🔵 良好 (75-89分) 
  - 🟡 一般 (60-74分)
  - 🔴 较差 (0-59分)

#### 3. 实时监控与告警
- 实时健康状态检查
- 自动生成改进建议
- 异常数据识别和报告

### API端点

```javascript
// 获取数据健康报告
GET /api/data-health

// 响应示例
{
  "success": true,
  "summary": {
    "overall_health_score": 85,
    "health_status": "good",
    "total_stocks": 500,
    "recommendations": ["考虑运行批量更新以提高数据质量"]
  },
  "metrics": {
    "data_completeness": {
      "rate": 96.5,
      "status": "good"
    },
    "data_freshness": {
      "rate": 78.2,
      "status": "fair"
    }
    // ... 更多指标
  }
}
```

## 🔄 智能批量更新系统

### 更新策略

#### 1. 标准更新 (Standard Update)
- **触发条件**: 每日定时 (UTC 8:00)
- **处理方式**: 分批并行处理 (10股票/批)
- **适用场景**: 日常数据维护

#### 2. 批量更新 (Batch Update)
- **触发条件**: 
  - 健康分数 < 70分时自动触发
  - 手动触发
- **处理方式**: 大批量并行处理 (20股票/批)
- **重试机制**: 最多3次重试，指数退避
- **适用场景**: 数据恢复、大规模修复

#### 3. 仅标签更新 (Tags-Only Update)
- **触发条件**: 手动触发
- **处理内容**: 仅重新计算动态标签
- **适用场景**: 标签算法更新后的批量重算

### 性能优化

```javascript
// 批量更新配置
const BATCH_CONFIG = {
  BATCH_SIZE: 20,                    // 每批处理股票数
  DELAY_BETWEEN_BATCHES: 2000,       // 批次间延迟(ms)
  MAX_RETRIES: 3,                    // 最大重试次数
  RETRY_DELAY_BASE: 1000             // 重试基础延迟(ms)
};
```

## 📊 GitHub Actions 工作流

### 增强的自动化流程

```yaml
# .github/workflows/scheduled_update.yml
name: Comprehensive Stock Data Update

jobs:
  # 1. 健康检查
  health-check:
    runs-on: ubuntu-latest
    outputs:
      health-score: ${{ steps.check.outputs.health-score }}
  
  # 2. 标准更新 (默认)
  standard-update:
    needs: health-check
    if: ${{ github.event.inputs.update_type == 'standard' || github.event.inputs.update_type == '' }}
  
  # 3. 批量更新 (健康分数<70时自动触发)
  batch-update:
    needs: health-check
    if: ${{ needs.health-check.outputs.health-score < 70 || github.event.inputs.update_type == 'batch' }}
  
  # 4. 更新后健康检查
  post-update-health:
    needs: [health-check, standard-update, batch-update]
    if: always()
```

### 手动触发选项
- `standard`: 标准更新
- `batch`: 批量更新
- `tags-only`: 仅标签更新

## 📈 统计与监控

### 更新统计表结构

```sql
CREATE TABLE update_stats (
    id BIGSERIAL PRIMARY KEY,
    update_type VARCHAR(20) NOT NULL,     -- standard/batch/tags-only
    total_stocks INTEGER NOT NULL,
    success_count INTEGER NOT NULL,
    error_count INTEGER NOT NULL,
    duration_seconds INTEGER NOT NULL,
    triggered_by VARCHAR(50),              -- manual/cron/health-check
    trigger_reason TEXT,
    health_score_before INTEGER,
    health_score_after INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);
```

### 监控视图

```sql
-- 最近30天更新统计摘要
CREATE VIEW recent_update_summary AS
SELECT 
    update_type,
    COUNT(*) as update_count,
    AVG(success_count::FLOAT / NULLIF(total_stocks, 0) * 100) as avg_success_rate,
    AVG(duration_seconds) as avg_duration_seconds,
    MAX(created_at) as last_update
FROM update_stats 
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY update_type;
```

## 🖥️ 管理界面

### 健康监控页面 (`/admin/health`)

#### 功能特性
- **实时健康仪表板**: 显示综合健康分数和各项指标
- **可视化进度条**: 直观展示各维度健康状况
- **智能建议**: 基于当前状态提供操作建议
- **手动触发**: 支持一键触发各类更新操作
- **历史记录**: 显示最近的更新操作历史

#### 界面组件
```javascript
// 主要组件
- HealthScoreCard      // 总体健康分数卡片
- MetricCards          // 各项指标卡片
- UpdateHistory        // 更新历史列表
- ActionButtons        // 操作按钮组
```

## 🔧 配置与部署

### 环境变量

```bash
# Vercel部署URL
VERCEL_URL=https://your-app.vercel.app

# API认证密钥
CRON_SECRET=your-secure-cron-secret

# Supabase配置
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### GitHub Secrets配置

```bash
# 在GitHub仓库设置中添加以下Secrets:
VERCEL_URL          # Vercel部署URL
CRON_SECRET         # API认证密钥
```

### 数据库迁移

```bash
# 运行迁移创建update_stats表
supabase db push

# 或手动执行SQL文件
psql -f supabase/migrations/20241220000003_create_update_stats.sql
```

## 📋 使用指南

### 1. 日常监控

1. 访问 `/admin/health` 页面
2. 查看总体健康分数和各项指标
3. 根据建议执行相应操作

### 2. 手动更新

```bash
# 标准更新
curl -H "Authorization: Bearer $CRON_SECRET" \
     "$VERCEL_URL/api/update-tags"

# 批量更新
curl -H "Authorization: Bearer $CRON_SECRET" \
     "$VERCEL_URL/api/batch-update"

# 健康检查
curl "$VERCEL_URL/api/data-health"
```

### 3. GitHub Actions手动触发

1. 进入GitHub仓库的Actions页面
2. 选择"Comprehensive Stock Data Update"工作流
3. 点击"Run workflow"
4. 选择更新类型：`standard`/`batch`/`tags-only`

## 🚨 故障排除

### 常见问题

#### 1. 健康分数持续偏低
- **原因**: 数据源API限制或网络问题
- **解决**: 运行批量更新，检查API配额

#### 2. 批量更新失败
- **原因**: API密钥错误或数据库连接问题
- **解决**: 检查环境变量配置，验证数据库连接

#### 3. GitHub Actions执行失败
- **原因**: Secrets配置错误或API端点不可访问
- **解决**: 验证Secrets配置，检查Vercel部署状态

### 监控指标阈值

```javascript
// 建议的健康阈值
const HEALTH_THRESHOLDS = {
  EXCELLENT: 90,     // 优秀
  GOOD: 75,          // 良好
  FAIR: 60,          // 一般
  POOR: 0            // 较差
};

// 自动批量更新触发阈值
const AUTO_BATCH_THRESHOLD = 70;
```

## 🔮 未来扩展

### 计划功能
- **预测性维护**: 基于历史趋势预测数据质量下降
- **智能调度**: 根据系统负载动态调整更新频率
- **多数据源支持**: 集成多个股票数据API提供商
- **实时告警**: 集成邮件/Slack通知系统
- **性能分析**: 详细的API调用性能分析

### 扩展接口
```javascript
// 未来API端点
GET  /api/health/trends        // 健康趋势分析
POST /api/health/alerts        // 配置告警规则
GET  /api/performance/stats    // 性能统计
POST /api/maintenance/schedule // 维护计划
```

---

## 📞 技术支持

如有问题或建议，请通过以下方式联系：
- 创建GitHub Issue
- 查看项目文档
- 联系开发团队

**系统版本**: v2.0.0  
**最后更新**: 2024年12月20日