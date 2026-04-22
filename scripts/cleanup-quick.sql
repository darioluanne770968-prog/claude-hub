-- ============================================================
-- Claude Hub - 快速清理脚本(一键执行)
-- ============================================================
-- 删除 30 天前的数据并释放空间
-- 预计释放 1.5-2GB 空间
-- ============================================================

-- 步骤 1: 查看当前数据
SELECT '=== 清理前数据统计 ===' as step;

SELECT
  '当前总消息数' as description,
  COUNT(*) as count,
  pg_size_pretty(pg_total_relation_size('claude_hub_messages')) as table_size
FROM claude_hub_messages;

SELECT
  '30天前的消息数' as description,
  COUNT(*) as count
FROM claude_hub_messages
WHERE created_at < NOW() - INTERVAL '30 days';

-- 步骤 2: 执行清理
SELECT '=== 开始清理 ===' as step;

BEGIN;

DELETE FROM claude_hub_messages
WHERE created_at < NOW() - INTERVAL '30 days';

DELETE FROM claude_hub_sessions
WHERE id NOT IN (
  SELECT DISTINCT session_id
  FROM claude_hub_messages
);

COMMIT;

-- 步骤 3: 查看清理后数据
SELECT '=== 清理后数据统计 ===' as step;

SELECT
  '剩余消息数' as description,
  COUNT(*) as count
FROM claude_hub_messages;

-- 步骤 4: 释放空间
SELECT '=== 释放磁盘空间(可能需要几分钟) ===' as step;

VACUUM FULL claude_hub_messages;
VACUUM FULL claude_hub_sessions;

REINDEX TABLE claude_hub_messages;
REINDEX TABLE claude_hub_sessions;

-- 步骤 5: 查看最终结果
SELECT '=== 最终结果 ===' as step;

SELECT
  table_name,
  pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) as table_size,
  pg_size_pretty(pg_indexes_size(quote_ident(table_name))) as indexes_size
FROM (
  VALUES ('claude_hub_messages'), ('claude_hub_sessions')
) AS t(table_name);

-- 步骤 6: 创建清理历史表(可选)
CREATE TABLE IF NOT EXISTS cleanup_history (
  id bigserial PRIMARY KEY,
  deleted_messages bigint NOT NULL,
  deleted_sessions bigint NOT NULL,
  executed_at timestamptz DEFAULT NOW()
);

SELECT '=== 清理完成! ===' as step;
