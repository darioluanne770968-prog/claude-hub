-- ============================================================
-- Claude Hub - 智能压缩脚本(保留手机 app 兼容性)
-- ============================================================
-- 功能: 移除冗余数据，但保留手机 app 需要的结构
-- 预计效果: 减少 60-70% 存储空间，同时保持兼容性
-- ============================================================

-- 步骤 1: 查看压缩前状态
SELECT '=== 压缩前数据统计 ===' as step;

SELECT
  COUNT(*) as total_messages,
  pg_size_pretty(pg_total_relation_size('claude_hub_messages')) as table_size,
  pg_size_pretty(AVG(LENGTH(content::text))::bigint) as avg_size
FROM claude_hub_messages
WHERE content IS NOT NULL;

-- ============================================================
-- 步骤 2: 智能压缩(保留必要结构)
-- ============================================================

BEGIN;

-- 压缩大的工具结果(超过 1000 字符的截断)
UPDATE claude_hub_messages
SET content = (
  SELECT jsonb_set(
    content,
    '{content}',
    (
      SELECT jsonb_agg(
        CASE
          -- 工具结果太大，截断
          WHEN item->>'type' = 'tool_result'
               AND LENGTH(item->>'content') > 1000 THEN
            jsonb_set(
              item,
              '{content}',
              to_jsonb(SUBSTRING(item->>'content', 1, 1000) || '...[已截断]')
            )
          -- 其他内容保留
          ELSE item
        END
      )
      FROM jsonb_array_elements(content->'content') AS item
    )
  )
  FROM claude_hub_messages m
  WHERE m.id = claude_hub_messages.id
    AND content ? 'content'
    AND jsonb_typeof(content->'content') = 'array'
)
WHERE content ? 'content'
  AND jsonb_typeof(content->'content') = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(content->'content') AS item
    WHERE item->>'type' = 'tool_result'
      AND LENGTH(item->>'content') > 1000
  );

COMMIT;

-- ============================================================
-- 步骤 3: 释放空间
-- ============================================================

VACUUM FULL claude_hub_messages;
REINDEX TABLE claude_hub_messages;

-- 步骤 4: 查看压缩后状态
SELECT '=== 压缩后数据统计 ===' as step;

SELECT
  COUNT(*) as total_messages,
  pg_size_pretty(pg_total_relation_size('claude_hub_messages')) as table_size,
  pg_size_pretty(AVG(LENGTH(content::text))::bigint) as avg_size
FROM claude_hub_messages
WHERE content IS NOT NULL;

SELECT '=== 压缩完成! ===' as step;
