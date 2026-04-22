-- ============================================================
-- Claude Hub - 设置自动清理策略
-- ============================================================
-- 功能: 创建定期清理旧消息的数据库函数和触发器
-- ============================================================

-- 1. 创建清理函数
CREATE OR REPLACE FUNCTION cleanup_old_messages()
RETURNS TABLE(
  deleted_messages bigint,
  deleted_sessions bigint
) AS $$
DECLARE
  msg_count bigint;
  sess_count bigint;
BEGIN
  -- 删除 30 天前的消息
  DELETE FROM claude_hub_messages
  WHERE created_at < NOW() - INTERVAL '30 days';

  GET DIAGNOSTICS msg_count = ROW_COUNT;

  -- 清理孤立的会话(没有任何消息的会话)
  DELETE FROM claude_hub_sessions
  WHERE id NOT IN (
    SELECT DISTINCT session_id
    FROM claude_hub_messages
  );

  GET DIAGNOSTICS sess_count = ROW_COUNT;

  -- 自动清理表
  EXECUTE 'VACUUM ANALYZE claude_hub_messages';
  EXECUTE 'VACUUM ANALYZE claude_hub_sessions';

  RETURN QUERY SELECT msg_count, sess_count;
END;
$$ LANGUAGE plpgsql;

-- 2. 手动执行一次清理(测试)
SELECT * FROM cleanup_old_messages();

-- ============================================================
-- 3. 使用 Supabase Edge Functions 定期调用 (推荐方案)
-- ============================================================
-- 注意: Supabase 免费版不支持 pg_cron,但你可以使用以下方案:
--
-- 方案 A: GitHub Actions 定期调用清理 API
--   创建一个 API 端点调用 cleanup_old_messages()
--   使用 GitHub Actions 每天触发一次
--
-- 方案 B: Vercel Cron Jobs
--   部署到 Vercel,使用 Vercel Cron 定期调用
--
-- 方案 C: 客户端自动清理
--   在应用启动时检查上次清理时间,超过 24 小时则触发清理
-- ============================================================

-- 4. 创建清理历史记录表(可选)
CREATE TABLE IF NOT EXISTS cleanup_history (
  id bigserial PRIMARY KEY,
  deleted_messages bigint NOT NULL,
  deleted_sessions bigint NOT NULL,
  executed_at timestamptz DEFAULT NOW()
);

-- 5. 修改清理函数以记录历史
CREATE OR REPLACE FUNCTION cleanup_old_messages_with_log()
RETURNS TABLE(
  deleted_messages bigint,
  deleted_sessions bigint
) AS $$
DECLARE
  msg_count bigint;
  sess_count bigint;
BEGIN
  -- 删除 30 天前的消息
  DELETE FROM claude_hub_messages
  WHERE created_at < NOW() - INTERVAL '30 days';

  GET DIAGNOSTICS msg_count = ROW_COUNT;

  -- 清理孤立的会话
  DELETE FROM claude_hub_sessions
  WHERE id NOT IN (
    SELECT DISTINCT session_id
    FROM claude_hub_messages
  );

  GET DIAGNOSTICS sess_count = ROW_COUNT;

  -- 记录清理历史
  INSERT INTO cleanup_history (deleted_messages, deleted_sessions)
  VALUES (msg_count, sess_count);

  -- 自动清理表
  EXECUTE 'VACUUM ANALYZE claude_hub_messages';
  EXECUTE 'VACUUM ANALYZE claude_hub_sessions';

  RETURN QUERY SELECT msg_count, sess_count;
END;
$$ LANGUAGE plpgsql;

-- 6. 查看清理历史
SELECT
  id,
  deleted_messages,
  deleted_sessions,
  executed_at,
  executed_at::date as date
FROM cleanup_history
ORDER BY executed_at DESC
LIMIT 10;

-- ============================================================
-- 7. 如果你是 Supabase Pro 用户,可以使用 pg_cron (推荐)
-- ============================================================
-- 注意:需要在 Supabase Dashboard → Database → Extensions 中启用 pg_cron
--
-- -- 启用 pg_cron 扩展
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
--
-- -- 设置每天凌晨 2 点自动清理
-- SELECT cron.schedule(
--   'cleanup-old-messages-daily',
--   '0 2 * * *',  -- 每天凌晨 2 点
--   'SELECT cleanup_old_messages_with_log()'
-- );
--
-- -- 查看已设置的定时任务
-- SELECT * FROM cron.job;
--
-- -- 查看定时任务执行历史
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
--
-- -- 删除定时任务(如果需要)
-- SELECT cron.unschedule('cleanup-old-messages-daily');
-- ============================================================
