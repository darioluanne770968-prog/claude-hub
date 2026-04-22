-- ============================================================
-- Claude Hub - 清理旧消息数据脚本
-- ============================================================
-- 功能: 删除 30 天前的消息数据,释放 Supabase 存储空间
-- 预计效果: 释放 1.5-2GB 空间
--
-- 使用方法:
-- 1. 登录 Supabase 控制台
-- 2. 进入 SQL Editor
-- 3. 依次执行下面的 SQL 语句
-- ============================================================

-- 第一步:查看当前数据统计
-- (先运行这个,确认要删除的数据量)
SELECT
  '当前总消息数' as description,
  COUNT(*) as count,
  pg_size_pretty(pg_total_relation_size('claude_hub_messages')) as table_size
FROM claude_hub_messages
UNION ALL
SELECT
  '30天前的消息数' as description,
  COUNT(*) as count,
  pg_size_pretty(SUM(LENGTH(content::text) + LENGTH(encrypted_content::text))::bigint) as estimated_size
FROM claude_hub_messages
WHERE created_at < NOW() - INTERVAL '30 days';

-- ============================================================
-- 第二步:删除 30 天前的消息
-- ============================================================

BEGIN;

-- 2.1 删除 30 天前的消息数据
DELETE FROM claude_hub_messages
WHERE created_at < NOW() - INTERVAL '30 days';

-- 2.2 清理孤立的 session 记录(没有任何消息的会话)
DELETE FROM claude_hub_sessions
WHERE id NOT IN (
  SELECT DISTINCT session_id
  FROM claude_hub_messages
);

COMMIT;

-- ============================================================
-- 第三步:查看删除后的统计
-- ============================================================

SELECT
  '剩余消息数' as description,
  COUNT(*) as count,
  pg_size_pretty(pg_total_relation_size('claude_hub_messages')) as table_size
FROM claude_hub_messages;

-- ============================================================
-- 第四步:释放磁盘空间(非常重要!)
-- ============================================================
-- 注意:VACUUM FULL 会锁表,建议在低峰期执行
-- 这个操作会实际释放磁盘空间给 Supabase

-- 4.1 释放 messages 表空间
VACUUM FULL claude_hub_messages;

-- 4.2 释放 sessions 表空间
VACUUM FULL claude_hub_sessions;

-- 4.3 重建索引以优化查询性能
REINDEX TABLE claude_hub_messages;
REINDEX TABLE claude_hub_sessions;

-- ============================================================
-- 第五步:查看最终结果
-- ============================================================

SELECT
  table_name,
  pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) as table_size,
  pg_size_pretty(pg_indexes_size(quote_ident(table_name))) as indexes_size
FROM (
  VALUES ('claude_hub_messages'), ('claude_hub_sessions')
) AS t(table_name);

-- ============================================================
-- 可选:设置自动清理策略
-- ============================================================
-- 如果你希望未来自动清理 30 天前的数据,可以创建一个定时任务

-- 创建清理函数
CREATE OR REPLACE FUNCTION cleanup_old_messages()
RETURNS void AS $$
BEGIN
  -- 删除 30 天前的消息
  DELETE FROM claude_hub_messages
  WHERE created_at < NOW() - INTERVAL '30 days';

  -- 清理孤立的会话
  DELETE FROM claude_hub_sessions
  WHERE id NOT IN (
    SELECT DISTINCT session_id
    FROM claude_hub_messages
  );

  -- 自动清理
  VACUUM ANALYZE claude_hub_messages;
  VACUUM ANALYZE claude_hub_sessions;
END;
$$ LANGUAGE plpgsql;

-- 注意:Supabase 免费版不支持 pg_cron
-- 如果你是 Pro 版本,可以设置每天自动清理:
--
-- SELECT cron.schedule(
--   'cleanup-old-messages',
--   '0 2 * * *',  -- 每天凌晨 2 点执行
--   'SELECT cleanup_old_messages()'
-- );
