/**
 * Encrypted Cloud Sync for Claude Hub Desktop
 * All sensitive data is encrypted before upload
 * Optimized for performance with batch encryption and parallel processing
 */

import { supabaseAdmin } from './supabase-server';
import { getAllProjects, getSessionById, Session, SessionEntry } from './claude-sessions';
import { encrypt } from './encryption';

/**
 * 从 Message 对象中提取纯文本内容
 * 优化:只存储文本,不存储完整的 Message 对象
 */
function extractTextFromMessage(message: any): string | null {
  if (!message) return null;

  if (typeof message === 'string') {
    return message.slice(0, 10000); // 限制 10KB
  }

  if (message.text) {
    return typeof message.text === 'string'
      ? message.text.slice(0, 10000)
      : null;
  }

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

export interface EncryptedSyncResult {
  success: boolean;
  sessionsUploaded: number;
  sessionsSkipped: number;
  messagesUploaded: number;
  errors: string[];
}

type EncryptedSyncStage = 'idle' | 'preparing' | 'syncing' | 'completed' | 'failed';

export interface EncryptedSyncProgress {
  running: boolean;
  stage: EncryptedSyncStage;
  totalSessions: number;
  totalToSync: number;
  startedSessions: number;
  activeSessions: number;
  processedSessions: number;
  sessionsUploaded: number;
  sessionsSkipped: number;
  failedSessions: number;
  messagesUploaded: number;
  currentSessionId: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  finishedAt: string | null;
  error: string | null;
}

const DEFAULT_PROGRESS: EncryptedSyncProgress = {
  running: false,
  stage: 'idle',
  totalSessions: 0,
  totalToSync: 0,
  startedSessions: 0,
  activeSessions: 0,
  processedSessions: 0,
  sessionsUploaded: 0,
  sessionsSkipped: 0,
  failedSessions: 0,
  messagesUploaded: 0,
  currentSessionId: null,
  startedAt: null,
  updatedAt: null,
  finishedAt: null,
  error: null,
};

let encryptedSyncProgress: EncryptedSyncProgress = { ...DEFAULT_PROGRESS };

function updateProgress(partial: Partial<EncryptedSyncProgress>) {
  encryptedSyncProgress = {
    ...encryptedSyncProgress,
    ...partial,
    updatedAt: new Date().toISOString(),
  };
}

function resetProgress() {
  encryptedSyncProgress = {
    ...DEFAULT_PROGRESS,
    updatedAt: new Date().toISOString(),
  };
}

export function getEncryptedSyncProgress(): EncryptedSyncProgress {
  return { ...encryptedSyncProgress };
}

// Encrypted session data structure (matches mobile app)
interface EncryptedSessionData {
  projectPath: string;
  projectName: string;
  summaries: string[];
  customName?: string;
  firstMessage?: string;
}

// Encrypted message data structure
interface EncryptedMessageData {
  type: 'user' | 'assistant';
  content: unknown;
  uuid?: string;
  timestamp?: string;
}

interface SyncSessionEncryptedOptions {
  onMessageBatchUploaded?: (count: number) => void;
}

// Fast single object encryption
function encryptObject<T>(data: T, encryptionKey: string): string {
  const json = JSON.stringify(data);
  return encrypt(json, encryptionKey);
}

function getSessionLastModifiedString(session: Session): string {
  return session.lastModified instanceof Date
    ? session.lastModified.toISOString()
    : String(session.lastModified || '');
}

async function getRemoteSessionLastModifiedMap(userId: string): Promise<Map<string, string>> {
  const sessionMap = new Map<string, string>();
  const PAGE_SIZE = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from('claude_hub_sessions')
      .select('session_id,last_modified')
      .eq('user_id', userId)
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Failed to load remote session map: ${error.message}`);
    }

    if (!data || data.length === 0) {
      break;
    }

    for (const row of data) {
      const sessionId = (row as { session_id: string }).session_id;
      const lastModified = (row as { last_modified: string | null }).last_modified || '';
      sessionMap.set(sessionId, lastModified);
    }

    if (data.length < PAGE_SIZE) {
      break;
    }

    from += PAGE_SIZE;
  }

  return sessionMap;
}

/**
 * Sync all sessions with encryption (optimized with parallel processing)
 */
export async function syncAllSessionsEncrypted(
  userId: string,
  encryptionKey: string
): Promise<EncryptedSyncResult> {
  resetProgress();
  updateProgress({
    running: true,
    stage: 'preparing',
    startedAt: new Date().toISOString(),
    error: null,
  });

  const result: EncryptedSyncResult = {
    success: true,
    sessionsUploaded: 0,
    sessionsSkipped: 0,
    messagesUploaded: 0,
    errors: [],
  };

  try {
    const projects = await getAllProjects();

    // Flatten all sessions
    const allSessions: Session[] = [];
    for (const project of projects) {
      allSessions.push(...project.sessions);
    }

    const totalSessions = allSessions.length;
    console.log(`[Sync] Starting sync of ${totalSessions} sessions...`);
    updateProgress({
      totalSessions,
    });

    const remoteSessionMap = await getRemoteSessionLastModifiedMap(userId);
    const sessionsToSync = allSessions.filter((session) => {
      const remoteLastModified = remoteSessionMap.get(session.id) || '';
      return remoteLastModified !== getSessionLastModifiedString(session);
    });

    result.sessionsSkipped = totalSessions - sessionsToSync.length;
    updateProgress({
      stage: 'syncing',
      totalToSync: sessionsToSync.length,
      startedSessions: 0,
      activeSessions: 0,
      sessionsSkipped: result.sessionsSkipped,
    });

    if (sessionsToSync.length === 0) {
      console.log('[Sync] No changed sessions, skipping upload');
      updateProgress({
        running: false,
        stage: 'completed',
        startedSessions: 0,
        activeSessions: 0,
        processedSessions: 0,
        finishedAt: new Date().toISOString(),
      });
      return result;
    }

    // Process sessions in parallel batches
    const PARALLEL_BATCH = 5;
    let startedSessions = 0;
    let activeSessions = 0;

    const publishRuntimeProgress = (currentSessionId: string | null = null) => {
      updateProgress({
        startedSessions,
        activeSessions,
        processedSessions: result.sessionsUploaded + result.errors.length,
        sessionsUploaded: result.sessionsUploaded,
        failedSessions: result.errors.length,
        messagesUploaded: result.messagesUploaded,
        currentSessionId,
      });
    };

    for (let i = 0; i < sessionsToSync.length; i += PARALLEL_BATCH) {
      const batch = sessionsToSync.slice(i, i + PARALLEL_BATCH);

      await Promise.all(
        batch.map(async (session) => {
          startedSessions++;
          activeSessions++;
          publishRuntimeProgress(session.id);

          try {
            await syncSessionEncrypted(session, userId, encryptionKey, {
              onMessageBatchUploaded: (count) => {
                result.messagesUploaded += count;
                publishRuntimeProgress(session.id);
              },
            });
            result.sessionsUploaded++;
          } catch (error) {
            const errorMsg = `Failed to sync session ${session.id}: ${error}`;
            console.error(errorMsg);
            result.errors.push(errorMsg);
          } finally {
            activeSessions = Math.max(0, activeSessions - 1);
            publishRuntimeProgress(activeSessions > 0 ? session.id : null);
          }
        })
      );

      console.log(`[Sync] Progress: ${Math.min(i + PARALLEL_BATCH, sessionsToSync.length)}/${sessionsToSync.length} sessions`);
    }
  } catch (error) {
    result.success = false;
    result.errors.push(`Failed to get projects: ${error}`);
    updateProgress({
      running: false,
      stage: 'failed',
      activeSessions: 0,
      error: String(error),
      finishedAt: new Date().toISOString(),
    });
  }

  if (result.success) {
    updateProgress({
      running: false,
      stage: 'completed',
      activeSessions: 0,
      finishedAt: new Date().toISOString(),
      currentSessionId: null,
    });
  }

  console.log(`[Sync] Completed: ${result.sessionsUploaded} sessions, ${result.messagesUploaded} messages`);
  return result;
}

/**
 * Sync a single session with encryption (with full messages)
 */
export async function syncSessionEncrypted(
  session: Session,
  userId: string,
  encryptionKey: string,
  options: SyncSessionEncryptedOptions = {}
): Promise<void> {
  const lastModifiedStr = getSessionLastModifiedString(session);

  // Prepare encrypted session data
  const sensitiveData: EncryptedSessionData = {
    projectPath: session.projectPath,
    projectName: session.projectName,
    summaries: session.summaries,
    customName: session.customName,
    firstMessage: session.firstMessage?.slice(0, 500),
  };

  const encryptedData = encryptObject(sensitiveData, encryptionKey);

  // Upsert session with encrypted data
  const { data: sessionData, error: sessionError } = await supabaseAdmin
    .from('claude_hub_sessions')
    .upsert({
      user_id: userId,
      session_id: session.id,
      message_count: session.messages.filter(m => m.type === 'user' || m.type === 'assistant').length,
      is_ide: session.isIde || false,
      last_modified: lastModifiedStr || null,
      encrypted_data: encryptedData,
      project_path: null,
      project_name: null,
      first_message: null,
      summaries: [],
      custom_name: null,
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

  // 优化:增量同步 - 只插入新消息
  // 1. 获取数据库中已存在的消息 UUID
  const { data: existingMessages } = await supabaseAdmin
    .from('claude_hub_messages')
    .select('message_uuid')
    .eq('session_id', sessionData.id);

  const existingUuids = new Set(
    (existingMessages || []).map(m => m.message_uuid).filter(Boolean)
  );

  // 2. 只准备新消息
  const newMessages = session.messages
    .filter(entry => !existingUuids.has(entry.uuid))
    .map((entry: SessionEntry) => {
      // 优化:只加密和存储文本内容,不存储完整的 message 对象
      let contentToEncrypt: any = null;

      if (entry.type === 'summary') {
        contentToEncrypt = { summary: entry.summary };
      } else if (entry.message) {
        // 只提取文本内容
        const textContent = extractTextFromMessage(entry.message);
        contentToEncrypt = textContent ? { text: textContent } : null;
      }

      const messageData: EncryptedMessageData = {
        type: entry.type as 'user' | 'assistant',
        content: contentToEncrypt,
        uuid: entry.uuid,
        timestamp: entry.timestamp,
      };

      return {
        session_id: sessionData.id,
        entry_type: entry.type,
        encrypted_content: encryptObject(messageData, encryptionKey),
        message_uuid: entry.uuid,
        parent_uuid: entry.parentUuid,
        timestamp: entry.timestamp,
        content: null,
      };
    });

  // 如果没有新消息,直接返回
  if (newMessages.length === 0) {
    console.log(`[Sync] No new messages for session ${session.id}`);
    return;
  }

  const messages = newMessages;

  // Batch insert with larger batch size
  const BATCH_SIZE = 1000;
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    const { error: messagesError } = await supabaseAdmin
      .from('claude_hub_messages')
      .insert(batch);

    if (messagesError) {
      console.error(`Messages batch insert failed: ${messagesError.message}`);
    } else if (options.onMessageBatchUploaded) {
      options.onMessageBatchUploaded(batch.length);
    }
  }

  console.log(`[Sync] Synced session ${session.id} with ${messages.length} messages`);
}

/**
 * Sync a session by ID with encryption
 */
export async function syncSessionByIdEncrypted(
  sessionId: string,
  userId: string,
  encryptionKey: string
): Promise<boolean> {
  try {
    const session = await getSessionById(sessionId);
    if (!session) {
      console.error(`Session not found: ${sessionId}`);
      return false;
    }
    await syncSessionEncrypted(session, userId, encryptionKey);
    return true;
  } catch (error) {
    console.error(`Failed to sync session ${sessionId}:`, error);
    return false;
  }
}
