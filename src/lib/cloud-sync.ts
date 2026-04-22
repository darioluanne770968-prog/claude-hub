import { supabaseAdmin, DEVICE_USER_ID } from './supabase-server';
import { getAllProjects, getSessionById, Session, SessionEntry } from './claude-sessions';

/**
 * 从 Message 对象中提取纯文本内容
 * 优化:只存储文本,不存储完整的 Message 对象(包括工具调用、图片等)
 */
function extractTextContent(message: any): string | null {
  if (!message) return null;

  // 如果是字符串,直接返回
  if (typeof message === 'string') {
    return message.slice(0, 10000); // 限制最大 10KB
  }

  // 如果有 text 字段
  if (message.text) {
    return typeof message.text === 'string'
      ? message.text.slice(0, 10000)
      : null;
  }

  // 如果有 content 数组(Claude API 格式)
  if (Array.isArray(message.content)) {
    const textParts = message.content
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .filter(Boolean);

    return textParts.length > 0
      ? textParts.join('\n').slice(0, 10000)
      : null;
  }

  return null;
}

export interface SyncResult {
  success: boolean;
  sessionsUploaded: number;
  messagesUploaded: number;
  errors: string[];
}

// Sync all sessions to Supabase
export async function syncAllSessionsToCloud(): Promise<SyncResult> {
  const result: SyncResult = {
    success: true,
    sessionsUploaded: 0,
    messagesUploaded: 0,
    errors: [],
  };

  try {
    const projects = await getAllProjects();

    for (const project of projects) {
      for (const session of project.sessions) {
        try {
          await syncSessionToCloud(session);
          result.sessionsUploaded++;
          result.messagesUploaded += session.messages.length;
        } catch (error) {
          const errorMsg = `Failed to sync session ${session.id}: ${error}`;
          console.error(errorMsg);
          result.errors.push(errorMsg);
        }
      }
    }
  } catch (error) {
    result.success = false;
    result.errors.push(`Failed to get projects: ${error}`);
  }

  return result;
}

// Sync a single session to Supabase
export async function syncSessionToCloud(session: Session): Promise<void> {
  // Upsert session metadata
  const { data: sessionData, error: sessionError } = await supabaseAdmin
    .from('claude_hub_sessions')
    .upsert({
      user_id: DEVICE_USER_ID,
      session_id: session.id,
      project_path: session.projectPath,
      project_name: session.projectName,
      first_message: session.firstMessage?.slice(0, 500),
      summaries: session.summaries,
      summaries_with_timestamps: session.summariesWithTimestamps,
      message_count: session.messages.filter(m => m.type === 'user' || m.type === 'assistant').length,
      is_ide: session.isIde || false,
      custom_name: session.customName,
      last_modified: session.lastModified instanceof Date
        ? session.lastModified.toISOString()
        : session.lastModified,
    }, {
      onConflict: 'user_id,session_id',
    })
    .select('id')
    .single();

  if (sessionError) {
    throw new Error(`Session upsert failed: ${sessionError.message}`);
  }

  if (!sessionData) {
    throw new Error('No session data returned');
  }

  // 优化:增量同步 - 只插入新消息,而不是删除所有消息后重新插入
  // 1. 获取数据库中已存在的消息 UUID
  const { data: existingMessages } = await supabaseAdmin
    .from('claude_hub_messages')
    .select('message_uuid')
    .eq('session_id', sessionData.id);

  const existingUuids = new Set(
    (existingMessages || []).map(m => m.message_uuid).filter(Boolean)
  );

  // 2. 只准备新消息(不在数据库中的消息)
  const newMessages = session.messages
    .filter(entry => !existingUuids.has(entry.uuid))
    .map((entry: SessionEntry) => {
      // 优化:只存储必要的内容,而不是完整的 message 对象
      let contentToStore: any = null;

      if (entry.type === 'summary') {
        contentToStore = { summary: entry.summary };
      } else if (entry.message) {
        // 只提取文本内容,不存储完整的 Message 对象
        const textContent = extractTextContent(entry.message);
        contentToStore = textContent ? { text: textContent } : null;
      }

      return {
        session_id: sessionData.id,
        entry_type: entry.type,
        content: contentToStore,
        message_uuid: entry.uuid,
        parent_uuid: entry.parentUuid,
        timestamp: entry.timestamp,
      };
    });

  // 如果没有新消息,直接返回
  if (newMessages.length === 0) {
    return;
  }

  const messages = newMessages;

  // Batch insert (Supabase has a limit, so we chunk)
  const BATCH_SIZE = 500;
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    const { error: messagesError } = await supabaseAdmin
      .from('claude_hub_messages')
      .insert(batch);

    if (messagesError) {
      console.error(`Messages batch insert failed: ${messagesError.message}`);
      // Continue with other batches even if one fails
    }
  }
}

// Sync a session by ID
export async function syncSessionByIdToCloud(sessionId: string): Promise<boolean> {
  try {
    const session = await getSessionById(sessionId);
    if (!session) {
      console.error(`Session not found: ${sessionId}`);
      return false;
    }
    await syncSessionToCloud(session);
    return true;
  } catch (error) {
    console.error(`Failed to sync session ${sessionId}:`, error);
    return false;
  }
}

// Get sync status
export async function getCloudSyncStatus(): Promise<{
  totalSessions: number;
  lastSyncTime: string | null;
}> {
  const { count, error } = await supabaseAdmin
    .from('claude_hub_sessions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', DEVICE_USER_ID);

  if (error) {
    console.error('Failed to get sync status:', error);
    return { totalSessions: 0, lastSyncTime: null };
  }

  // Get the most recent update time
  const { data: latestSession } = await supabaseAdmin
    .from('claude_hub_sessions')
    .select('updated_at')
    .eq('user_id', DEVICE_USER_ID)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();

  return {
    totalSessions: count || 0,
    lastSyncTime: latestSession?.updated_at || null,
  };
}
