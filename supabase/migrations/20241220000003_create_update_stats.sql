-- 文件路径: supabase/migrations/20241220000003_create_update_stats.sql

-- 创建更新统计表，用于跟踪数据更新操作的历史和性能
CREATE TABLE IF NOT EXISTS update_stats (
    id BIGSERIAL PRIMARY KEY,
    
    -- 更新类型：standard(标准), batch(批量), tags-only(仅标签)
    update_type VARCHAR(20) NOT NULL CHECK (update_type IN ('standard', 'batch', 'tags-only')),
    
    -- 更新统计信息
    total_stocks INTEGER NOT NULL DEFAULT 0,
    success_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    
    -- 性能指标
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    
    -- 触发信息
    triggered_by VARCHAR(50) DEFAULT 'manual', -- manual, cron, health-check
    trigger_reason TEXT, -- 触发原因的详细描述
    
    -- 健康分数（更新前后）
    health_score_before INTEGER,
    health_score_after INTEGER,
    
    -- 时间戳
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- 额外的元数据
    metadata JSONB DEFAULT '{}'
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_update_stats_type ON update_stats(update_type);
CREATE INDEX IF NOT EXISTS idx_update_stats_created_at ON update_stats(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_update_stats_triggered_by ON update_stats(triggered_by);

-- 创建复合索引用于常见查询
CREATE INDEX IF NOT EXISTS idx_update_stats_type_date ON update_stats(update_type, created_at DESC);

-- 添加表注释
COMMENT ON TABLE update_stats IS '数据更新操作的统计和历史记录表';
COMMENT ON COLUMN update_stats.update_type IS '更新类型：standard(标准更新), batch(批量更新), tags-only(仅标签更新)';
COMMENT ON COLUMN update_stats.total_stocks IS '本次更新涉及的股票总数';
COMMENT ON COLUMN update_stats.success_count IS '成功更新的股票数量';
COMMENT ON COLUMN update_stats.error_count IS '更新失败的股票数量';
COMMENT ON COLUMN update_stats.duration_seconds IS '更新操作耗时（秒）';
COMMENT ON COLUMN update_stats.triggered_by IS '触发方式：manual(手动), cron(定时任务), health-check(健康检查触发)';
COMMENT ON COLUMN update_stats.trigger_reason IS '触发更新的具体原因';
COMMENT ON COLUMN update_stats.health_score_before IS '更新前的数据健康分数';
COMMENT ON COLUMN update_stats.health_score_after IS '更新后的数据健康分数';
COMMENT ON COLUMN update_stats.metadata IS '额外的元数据，如错误详情、API调用次数等';

-- 创建视图：最近30天的更新统计摘要
CREATE OR REPLACE VIEW recent_update_summary AS
SELECT 
    update_type,
    COUNT(*) as update_count,
    AVG(success_count::FLOAT / NULLIF(total_stocks, 0) * 100) as avg_success_rate,
    AVG(duration_seconds) as avg_duration_seconds,
    SUM(total_stocks) as total_stocks_processed,
    SUM(success_count) as total_successes,
    SUM(error_count) as total_errors,
    MAX(created_at) as last_update,
    AVG(health_score_after) as avg_health_score_after
FROM update_stats 
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY update_type
ORDER BY update_count DESC;

COMMENT ON VIEW recent_update_summary IS '最近30天各类型更新操作的统计摘要';

-- 创建函数：获取数据更新趋势
CREATE OR REPLACE FUNCTION get_update_trends(
    days_back INTEGER DEFAULT 7,
    update_type_filter VARCHAR DEFAULT NULL
)
RETURNS TABLE (
    date_bucket DATE,
    update_type VARCHAR,
    update_count BIGINT,
    avg_success_rate NUMERIC,
    avg_duration NUMERIC,
    total_stocks_processed BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        DATE(us.created_at) as date_bucket,
        us.update_type,
        COUNT(*) as update_count,
        ROUND(AVG(us.success_count::FLOAT / NULLIF(us.total_stocks, 0) * 100), 2) as avg_success_rate,
        ROUND(AVG(us.duration_seconds), 2) as avg_duration,
        SUM(us.total_stocks) as total_stocks_processed
    FROM update_stats us
    WHERE 
        us.created_at >= NOW() - (days_back || ' days')::INTERVAL
        AND (update_type_filter IS NULL OR us.update_type = update_type_filter)
    GROUP BY DATE(us.created_at), us.update_type
    ORDER BY date_bucket DESC, us.update_type;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_update_trends IS '获取指定天数内的数据更新趋势分析';

-- 创建函数：清理旧的统计记录（保留最近90天）
CREATE OR REPLACE FUNCTION cleanup_old_update_stats()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM update_stats 
    WHERE created_at < NOW() - INTERVAL '90 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- 记录清理操作
    INSERT INTO update_stats (
        update_type, 
        total_stocks, 
        success_count, 
        error_count, 
        duration_seconds,
        triggered_by,
        trigger_reason,
        metadata
    ) VALUES (
        'maintenance',
        0,
        deleted_count,
        0,
        0,
        'system',
        'Automated cleanup of old update statistics',
        jsonb_build_object('deleted_records', deleted_count)
    );
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_update_stats IS '清理90天前的更新统计记录，返回删除的记录数';

-- 插入一些示例数据（可选，用于测试）
INSERT INTO update_stats (
    update_type, 
    total_stocks, 
    success_count, 
    error_count, 
    duration_seconds,
    triggered_by,
    trigger_reason,
    health_score_before,
    health_score_after,
    created_at
) VALUES 
    ('standard', 500, 495, 5, 120, 'cron', 'Daily scheduled update', 85, 92, NOW() - INTERVAL '1 day'),
    ('batch', 500, 480, 20, 300, 'health-check', 'Health score below threshold (65)', 65, 88, NOW() - INTERVAL '2 days'),
    ('tags-only', 500, 500, 0, 45, 'manual', 'Manual tag recalculation', 88, 90, NOW() - INTERVAL '3 days');