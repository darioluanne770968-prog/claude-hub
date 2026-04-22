-- ============================================================
-- Claude Hub - 数据迁移脚本
-- ============================================================
-- 功能: 将现有的完整 Message 对象转换为精简的文本格式
-- 预计效果: 将 3.6GB 数据压缩到 ~360MB (减少 90%)
-- ============================================================

-- 步骤 1: 查看迁移前的数据统计
SELECT '=== 迁移前数据统计 ===' as step;

SELECT
  '总消息数' as description,
  COUNT(*) as count,
  pg_size_pretty(pg_total_relation_size('claude_hub_messages')) as table_size,
  pg_size_pretty(AVG(LENGTH(content::text))::bigint) as avg_message_size
FROM claude_hub_messages
WHERE content IS NOT NULL;

-- 步骤 2: 查看示例数据(了解当前格式)
SELECT '=== 示例消息数据 ===' as step;

SELECT
  id,
  entry_type,
  LENGTH(content::text) as content_size,
  content::text as sample_content
FROM claude_hub_messages
WHERE content IS NOT NULL
LIMIT 3;

-- ============================================================
-- 步骤 3: 执行数据迁移(精简存储)
-- ============================================================

SELECT '=== 开始数据迁移 ===' as step;

-- 3.1 创建备份表(可选,安全起见)
CREATE TABLE IF NOT EXISTS claude_hub_messages_backup AS
SELECT * FROM claude_hub_messages
LIMIT 100;  -- 只备份前 100 条作为样本

SELECT '备份完成' as status;

-- 3.2 迁移: 提取纯文本内容
BEGIN;

-- 处理有 content 字段的消息
UPDATE claude_hub_messages
SET content =
  CASE
    -- 如果 content 有 text 字段,只保留 text
    WHEN content ? 'text' THEN
      jsonb_build_object('text', SUBSTRING(content->>'text', 1, 10000))

    -- 如果 content 有 summary 字段,保留 summary
    WHEN content ? 'summary' THEN
      jsonb_build_object('summary', SUBSTRING(content->>'summary', 1, 10000))

    -- 如果 content 是字符串,直接转换
    WHEN jsonb_typeof(content) = 'string' THEN
      jsonb_build_object('text', SUBSTRING(content#>>'{}', 1, 10000))

    -- 其他情况,尝试提取任何文本
    ELSE
      jsonb_build_object('text', SUBSTRING(content::text, 1, 10000))
  END
WHERE content IS NOT NULL
  AND LENGTH(content::text) > 500;  -- 只处理大于 500 字节的消息

COMMIT;

SELECT '内容迁移完成' as status;

-- ============================================================
-- 步骤 4: 清理加密内容(如果不使用加密同步)
-- ============================================================

-- 如果你不使用加密同步功能,可以清空 encrypted_content 字段
-- 取消注释以下代码来执行:

-- BEGIN;
--
-- UPDATE claude_hub_messages
-- SET encrypted_content = NULL
-- WHERE encrypted_content IS NOT NULL;
--
-- COMMIT;
--
-- SELECT '加密内容已清理' as status;

-- ============================================================
-- 步骤 5: 释放磁盘空间(非常重要!)
-- ============================================================

SELECT '=== 释放磁盘空间(可能需要几分钟) ===' as step;

VACUUM FULL claude_hub_messages;
VACUUM FULL claude_hub_sessions;

REINDEX TABLE claude_hub_messages;
REINDEX TABLE claude_hub_sessions;

SELECT '空间释放完成' as status;

-- ============================================================
-- 步骤 6: 查看迁移后的数据统计
-- ============================================================

SELECT '=== 迁移后数据统计 ===' as step;

SELECT
  '总消息数' as description,
  COUNT(*) as count,
  pg_size_pretty(pg_total_relation_size('claude_hub_messages')) as table_size,
  pg_size_pretty(AVG(LENGTH(COALESCE(content::text, '')))::bigint) as avg_message_size
FROM claude_hub_messages;

-- 步骤 7: 查看最终表大小
SELECT '=== 最终结果 ===' as step;

SELECT
  table_name,
  pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) as table_size,
  pg_size_pretty(pg_indexes_size(quote_ident(table_name))) as indexes_size
FROM (
  VALUES ('claude_hub_messages'), ('claude_hub_sessions')
) AS t(table_name);

-- 步骤 8: 验证示例数据
SELECT '=== 迁移后示例数据 ===' as step;

SELECT
  id,
  entry_type,
  LENGTH(COALESCE(content::text, '')) as content_size,
  content::text as sample_content
FROM claude_hub_messages
WHERE content IS NOT NULL
LIMIT 3;

SELECT '=== 迁移完成! ===' as step;

-- ============================================================
-- 清理说明
-- ============================================================
-- 如果迁移成功且验证无误,可以删除备份表:
-- DROP TABLE IF EXISTS claude_hub_messages_backup;
