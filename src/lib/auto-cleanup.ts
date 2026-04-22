/**
 * 自动清理旧消息 - 客户端实现
 * 在应用启动时检查是否需要清理 30 天前的数据
 */

import { supabaseAdmin } from './supabase-server';

interface CleanupResult {
  success: boolean;
  deletedMessages: number;
  deletedSessions: number;
  error?: string;
}

const CLEANUP_INTERVAL_HOURS = 24; // 每 24 小时执行一次清理
const MESSAGE_RETENTION_DAYS = 30; // 保留 30 天的消息

/**
 * 检查是否需要执行清理
 */
async function shouldRunCleanup(): Promise<boolean> {
  try {
    // 从本地存储或数据库读取上次清理时间
    const { data, error } = await supabaseAdmin
      .from('cleanup_history')
      .select('executed_at')
      .order('executed_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = 没有找到记录
      console.error('Failed to get last cleanup time:', error);
      return true; // 出错时也执行清理
    }

    if (!data) {
      // 从未执行过清理
      return true;
    }

    const lastCleanup = new Date(data.executed_at);
    const now = new Date();
    const hoursSinceLastCleanup =
      (now.getTime() - lastCleanup.getTime()) / (1000 * 60 * 60);

    return hoursSinceLastCleanup >= CLEANUP_INTERVAL_HOURS;
  } catch (error) {
    console.error('Error checking cleanup status:', error);
    return true;
  }
}

/**
 * 执行清理旧消息
 */
export async function cleanupOldMessages(): Promise<CleanupResult> {
  try {
    // 1. 删除 30 天前的消息
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - MESSAGE_RETENTION_DAYS);

    const { error: deleteMessagesError, count: deletedMessages } =
      await supabaseAdmin
        .from('claude_hub_messages')
        .delete({ count: 'exact' })
        .lt('created_at', cutoffDate.toISOString());

    if (deleteMessagesError) {
      throw new Error(`Failed to delete messages: ${deleteMessagesError.message}`);
    }

    // 2. 清理孤立的会话(没有任何消息的会话)
    // 先获取所有有消息的 session_id
    const { data: sessionsWithMessages } = await supabaseAdmin
      .from('claude_hub_messages')
      .select('session_id');

    const activeSessionIds = new Set(
      (sessionsWithMessages || []).map(m => m.session_id)
    );

    // 获取所有 session
    const { data: allSessions } = await supabaseAdmin
      .from('claude_hub_sessions')
      .select('id');

    // 找出孤立的 session
    const orphanedSessionIds = (allSessions || [])
      .filter(s => !activeSessionIds.has(s.id))
      .map(s => s.id);

    let deletedSessions = 0;
    if (orphanedSessionIds.length > 0) {
      const { error: deleteSessionsError, count } = await supabaseAdmin
        .from('claude_hub_sessions')
        .delete({ count: 'exact' })
        .in('id', orphanedSessionIds);

      if (deleteSessionsError) {
        console.error('Failed to delete orphaned sessions:', deleteSessionsError);
      } else {
        deletedSessions = count || 0;
      }
    }

    // 3. 记录清理历史
    await supabaseAdmin.from('cleanup_history').insert({
      deleted_messages: deletedMessages || 0,
      deleted_sessions: deletedSessions,
    });

    console.log(`[Cleanup] Deleted ${deletedMessages} messages and ${deletedSessions} sessions`);

    return {
      success: true,
      deletedMessages: deletedMessages || 0,
      deletedSessions,
    };
  } catch (error) {
    console.error('[Cleanup] Error:', error);
    return {
      success: false,
      deletedMessages: 0,
      deletedSessions: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 自动清理 - 检查是否需要清理,需要则执行
 */
export async function autoCleanup(): Promise<void> {
  try {
    const shouldCleanup = await shouldRunCleanup();

    if (shouldCleanup) {
      console.log('[Cleanup] Starting automatic cleanup...');
      const result = await cleanupOldMessages();

      if (result.success) {
        console.log(
          `[Cleanup] Completed: ${result.deletedMessages} messages, ${result.deletedSessions} sessions deleted`
        );
      } else {
        console.error('[Cleanup] Failed:', result.error);
      }
    } else {
      console.log('[Cleanup] Skipped: Last cleanup was recent');
    }
  } catch (error) {
    console.error('[Cleanup] Auto-cleanup error:', error);
  }
}

/**
 * 获取清理历史
 */
export async function getCleanupHistory(limit: number = 10) {
  const { data, error } = await supabaseAdmin
    .from('cleanup_history')
    .select('*')
    .order('executed_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Failed to get cleanup history:', error);
    return [];
  }

  return data || [];
}
