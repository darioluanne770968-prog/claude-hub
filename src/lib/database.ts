import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';

// Database file location
const DB_DIR = path.join(os.homedir(), '.claude');
const DB_PATH = path.join(DB_DIR, 'claude-hub.db');

// Ensure directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// Create database connection
const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Initialize schema
db.exec(`
  -- Sessions table (index for quick lookups)
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    project_path TEXT NOT NULL,
    project_name TEXT NOT NULL,
    last_modified TEXT NOT NULL,
    message_count INTEGER DEFAULT 0,
    first_message TEXT,
    custom_name TEXT,
    is_favorite INTEGER DEFAULT 0,
    is_archived INTEGER DEFAULT 0,
    note TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- Session summaries (one session can have multiple summaries)
  CREATE TABLE IF NOT EXISTS session_summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    summary TEXT NOT NULL,
    position INTEGER DEFAULT 0,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );

  -- Tags table
  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
  );

  -- Session-tag relationship
  CREATE TABLE IF NOT EXISTS session_tags (
    session_id TEXT NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (session_id, tag_id),
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
  );

  -- Webhooks table
  CREATE TABLE IF NOT EXISTS webhooks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    events TEXT NOT NULL, -- JSON array of event types
    enabled INTEGER DEFAULT 1,
    secret TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- Webhook logs
  CREATE TABLE IF NOT EXISTS webhook_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    webhook_id TEXT NOT NULL,
    event TEXT NOT NULL,
    payload TEXT,
    response_status INTEGER,
    response_body TEXT,
    success INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE CASCADE
  );

  -- Full-text search index for sessions
  CREATE VIRTUAL TABLE IF NOT EXISTS sessions_fts USING fts5(
    session_id,
    project_name,
    summaries,
    first_message,
    custom_name,
    content='',
    tokenize='unicode61'
  );

  -- Indexes for common queries
  CREATE INDEX IF NOT EXISTS idx_sessions_project_path ON sessions(project_path);
  CREATE INDEX IF NOT EXISTS idx_sessions_last_modified ON sessions(last_modified DESC);
  CREATE INDEX IF NOT EXISTS idx_sessions_is_favorite ON sessions(is_favorite);
  CREATE INDEX IF NOT EXISTS idx_sessions_is_archived ON sessions(is_archived);
  CREATE INDEX IF NOT EXISTS idx_session_summaries_session_id ON session_summaries(session_id);
  CREATE INDEX IF NOT EXISTS idx_session_tags_session_id ON session_tags(session_id);
  CREATE INDEX IF NOT EXISTS idx_session_tags_tag_id ON session_tags(tag_id);
`);

// Prepared statements for common operations
const statements = {
  // Sessions
  insertSession: db.prepare(`
    INSERT OR REPLACE INTO sessions
    (id, project_path, project_name, last_modified, message_count, first_message, custom_name, is_favorite, is_archived, note, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `),

  getSession: db.prepare(`
    SELECT s.*, GROUP_CONCAT(ss.summary, '|||') as summaries_concat
    FROM sessions s
    LEFT JOIN session_summaries ss ON s.id = ss.session_id
    WHERE s.id = ?
    GROUP BY s.id
  `),

  getAllSessions: db.prepare(`
    SELECT s.*, GROUP_CONCAT(ss.summary, '|||') as summaries_concat
    FROM sessions s
    LEFT JOIN session_summaries ss ON s.id = ss.session_id
    WHERE s.is_archived = 0
    GROUP BY s.id
    ORDER BY s.last_modified DESC
  `),

  getSessionsByProject: db.prepare(`
    SELECT s.*, GROUP_CONCAT(ss.summary, '|||') as summaries_concat
    FROM sessions s
    LEFT JOIN session_summaries ss ON s.id = ss.session_id
    WHERE s.project_path = ? AND s.is_archived = 0
    GROUP BY s.id
    ORDER BY s.last_modified DESC
  `),

  deleteSession: db.prepare(`DELETE FROM sessions WHERE id = ?`),

  updateSessionMeta: db.prepare(`
    UPDATE sessions SET custom_name = ?, is_favorite = ?, is_archived = ?, note = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `),

  // Summaries
  insertSummary: db.prepare(`
    INSERT INTO session_summaries (session_id, summary, position) VALUES (?, ?, ?)
  `),

  deleteSummaries: db.prepare(`DELETE FROM session_summaries WHERE session_id = ?`),

  // Tags
  insertTag: db.prepare(`INSERT OR IGNORE INTO tags (name) VALUES (?)`),
  getTagByName: db.prepare(`SELECT id FROM tags WHERE name = ?`),
  getAllTags: db.prepare(`SELECT DISTINCT t.name FROM tags t INNER JOIN session_tags st ON t.id = st.tag_id`),

  addSessionTag: db.prepare(`INSERT OR IGNORE INTO session_tags (session_id, tag_id) VALUES (?, ?)`),
  removeSessionTag: db.prepare(`DELETE FROM session_tags WHERE session_id = ? AND tag_id = ?`),
  getSessionTags: db.prepare(`
    SELECT t.name FROM tags t
    INNER JOIN session_tags st ON t.id = st.tag_id
    WHERE st.session_id = ?
  `),

  // FTS
  insertFTS: db.prepare(`
    INSERT INTO sessions_fts (session_id, project_name, summaries, first_message, custom_name)
    VALUES (?, ?, ?, ?, ?)
  `),
  deleteFTS: db.prepare(`DELETE FROM sessions_fts WHERE session_id = ?`),
  searchFTS: db.prepare(`
    SELECT session_id, rank FROM sessions_fts
    WHERE sessions_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `),

  // Webhooks
  insertWebhook: db.prepare(`
    INSERT INTO webhooks (id, name, url, events, enabled, secret)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  getAllWebhooks: db.prepare(`SELECT * FROM webhooks ORDER BY created_at DESC`),
  getWebhook: db.prepare(`SELECT * FROM webhooks WHERE id = ?`),
  updateWebhook: db.prepare(`
    UPDATE webhooks SET name = ?, url = ?, events = ?, enabled = ?, secret = ?
    WHERE id = ?
  `),
  deleteWebhook: db.prepare(`DELETE FROM webhooks WHERE id = ?`),
  getActiveWebhooksForEvent: db.prepare(`
    SELECT * FROM webhooks WHERE enabled = 1 AND events LIKE ?
  `),

  // Webhook logs
  insertWebhookLog: db.prepare(`
    INSERT INTO webhook_logs (webhook_id, event, payload, response_status, response_body, success)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  getWebhookLogs: db.prepare(`
    SELECT * FROM webhook_logs WHERE webhook_id = ? ORDER BY created_at DESC LIMIT ?
  `),

  // Stats
  getStats: db.prepare(`
    SELECT
      COUNT(*) as total_sessions,
      SUM(message_count) as total_messages,
      COUNT(DISTINCT project_path) as total_projects,
      SUM(is_favorite) as favorite_count,
      SUM(is_archived) as archived_count
    FROM sessions
  `),

  getSessionsByDate: db.prepare(`
    SELECT DATE(last_modified) as date, COUNT(*) as count
    FROM sessions
    WHERE last_modified >= ?
    GROUP BY DATE(last_modified)
    ORDER BY date
  `),
};

// Database service class
export class DatabaseService {
  // Session operations
  static upsertSession(session: {
    id: string;
    projectPath: string;
    projectName: string;
    lastModified: string;
    messageCount: number;
    firstMessage?: string;
    summaries: string[];
    customName?: string;
    isFavorite?: boolean;
    isArchived?: boolean;
    note?: string;
  }) {
    const transaction = db.transaction(() => {
      // Insert/update session
      statements.insertSession.run(
        session.id,
        session.projectPath,
        session.projectName,
        session.lastModified,
        session.messageCount,
        session.firstMessage || null,
        session.customName || null,
        session.isFavorite ? 1 : 0,
        session.isArchived ? 1 : 0,
        session.note || null
      );

      // Update summaries
      statements.deleteSummaries.run(session.id);
      session.summaries.forEach((summary, index) => {
        statements.insertSummary.run(session.id, summary, index);
      });

      // Update FTS index
      statements.deleteFTS.run(session.id);
      statements.insertFTS.run(
        session.id,
        session.projectName,
        session.summaries.join(' '),
        session.firstMessage || '',
        session.customName || ''
      );
    });

    transaction();
  }

  static getSession(id: string) {
    const row = statements.getSession.get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.transformSessionRow(row);
  }

  static getAllSessions() {
    const rows = statements.getAllSessions.all() as Record<string, unknown>[];
    return rows.map(row => this.transformSessionRow(row));
  }

  static getSessionsByProject(projectPath: string) {
    const rows = statements.getSessionsByProject.all(projectPath) as Record<string, unknown>[];
    return rows.map(row => this.transformSessionRow(row));
  }

  static deleteSession(id: string) {
    statements.deleteFTS.run(id);
    statements.deleteSession.run(id);
  }

  static updateSessionMeta(id: string, meta: {
    customName?: string | null;
    isFavorite?: boolean;
    isArchived?: boolean;
    note?: string | null;
  }) {
    const current = this.getSession(id);
    if (!current) return;

    statements.updateSessionMeta.run(
      meta.customName !== undefined ? meta.customName : current.customName,
      meta.isFavorite !== undefined ? (meta.isFavorite ? 1 : 0) : (current.isFavorite ? 1 : 0),
      meta.isArchived !== undefined ? (meta.isArchived ? 1 : 0) : (current.isArchived ? 1 : 0),
      meta.note !== undefined ? meta.note : current.note,
      id
    );

    // Update FTS if custom name changed
    if (meta.customName !== undefined) {
      const session = this.getSession(id);
      if (session) {
        statements.deleteFTS.run(id);
        statements.insertFTS.run(
          id,
          session.projectName,
          session.summaries.join(' '),
          session.firstMessage || '',
          meta.customName || ''
        );
      }
    }
  }

  // Tag operations
  static addTag(sessionId: string, tagName: string) {
    const transaction = db.transaction(() => {
      statements.insertTag.run(tagName);
      const tag = statements.getTagByName.get(tagName) as { id: number } | undefined;
      if (tag) {
        statements.addSessionTag.run(sessionId, tag.id);
      }
    });
    transaction();
  }

  static removeTag(sessionId: string, tagName: string) {
    const tag = statements.getTagByName.get(tagName) as { id: number } | undefined;
    if (tag) {
      statements.removeSessionTag.run(sessionId, tag.id);
    }
  }

  static getSessionTags(sessionId: string): string[] {
    const rows = statements.getSessionTags.all(sessionId) as { name: string }[];
    return rows.map(r => r.name);
  }

  static getAllTags(): string[] {
    const rows = statements.getAllTags.all() as { name: string }[];
    return rows.map(r => r.name);
  }

  // Search
  static search(query: string, limit = 50) {
    // Escape special FTS characters
    const escapedQuery = query.replace(/['"*()]/g, ' ').trim();
    if (!escapedQuery) return [];

    const ftsQuery = escapedQuery.split(/\s+/).map(term => `"${term}"*`).join(' OR ');
    const results = statements.searchFTS.all(ftsQuery, limit) as { session_id: string; rank: number }[];

    return results.map(r => {
      const session = this.getSession(r.session_id);
      return session ? { ...session, rank: r.rank } : null;
    }).filter(Boolean);
  }

  // Webhooks
  static createWebhook(webhook: {
    id: string;
    name: string;
    url: string;
    events: string[];
    enabled?: boolean;
    secret?: string;
  }) {
    statements.insertWebhook.run(
      webhook.id,
      webhook.name,
      webhook.url,
      JSON.stringify(webhook.events),
      webhook.enabled !== false ? 1 : 0,
      webhook.secret || null
    );
  }

  static getAllWebhooks() {
    const rows = statements.getAllWebhooks.all() as Record<string, unknown>[];
    return rows.map(row => ({
      id: row.id as string,
      name: row.name as string,
      url: row.url as string,
      events: JSON.parse(row.events as string) as string[],
      enabled: row.enabled === 1,
      secret: row.secret as string | null,
      createdAt: row.created_at as string,
    }));
  }

  static getWebhook(id: string) {
    const row = statements.getWebhook.get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: row.id as string,
      name: row.name as string,
      url: row.url as string,
      events: JSON.parse(row.events as string) as string[],
      enabled: row.enabled === 1,
      secret: row.secret as string | null,
      createdAt: row.created_at as string,
    };
  }

  static updateWebhook(id: string, webhook: {
    name?: string;
    url?: string;
    events?: string[];
    enabled?: boolean;
    secret?: string | null;
  }) {
    const current = this.getWebhook(id);
    if (!current) return;

    statements.updateWebhook.run(
      webhook.name ?? current.name,
      webhook.url ?? current.url,
      webhook.events ? JSON.stringify(webhook.events) : JSON.stringify(current.events),
      webhook.enabled !== undefined ? (webhook.enabled ? 1 : 0) : (current.enabled ? 1 : 0),
      webhook.secret !== undefined ? webhook.secret : current.secret,
      id
    );
  }

  static deleteWebhook(id: string) {
    statements.deleteWebhook.run(id);
  }

  static getActiveWebhooksForEvent(event: string) {
    const rows = statements.getActiveWebhooksForEvent.all(`%"${event}"%`) as Record<string, unknown>[];
    return rows.map(row => ({
      id: row.id as string,
      name: row.name as string,
      url: row.url as string,
      events: JSON.parse(row.events as string) as string[],
      enabled: row.enabled === 1,
      secret: row.secret as string | null,
    }));
  }

  static logWebhook(log: {
    webhookId: string;
    event: string;
    payload: unknown;
    responseStatus?: number;
    responseBody?: string;
    success: boolean;
  }) {
    statements.insertWebhookLog.run(
      log.webhookId,
      log.event,
      JSON.stringify(log.payload),
      log.responseStatus || null,
      log.responseBody || null,
      log.success ? 1 : 0
    );
  }

  static getWebhookLogs(webhookId: string, limit = 20) {
    const rows = statements.getWebhookLogs.all(webhookId, limit) as Record<string, unknown>[];
    return rows.map(row => ({
      id: row.id as number,
      webhookId: row.webhook_id as string,
      event: row.event as string,
      payload: row.payload ? JSON.parse(row.payload as string) : null,
      responseStatus: row.response_status as number | null,
      responseBody: row.response_body as string | null,
      success: row.success === 1,
      createdAt: row.created_at as string,
    }));
  }

  // Stats
  static getStats() {
    return statements.getStats.get() as {
      total_sessions: number;
      total_messages: number;
      total_projects: number;
      favorite_count: number;
      archived_count: number;
    };
  }

  static getSessionsByDate(since: string) {
    return statements.getSessionsByDate.all(since) as { date: string; count: number }[];
  }

  // Bulk operations
  static bulkUpsertSessions(sessions: Parameters<typeof DatabaseService.upsertSession>[0][]) {
    const transaction = db.transaction(() => {
      for (const session of sessions) {
        this.upsertSession(session);
      }
    });
    transaction();
  }

  // Helper to transform DB row to session object
  private static transformSessionRow(row: Record<string, unknown>) {
    const summariesConcat = row.summaries_concat as string | null;
    return {
      id: row.id as string,
      projectPath: row.project_path as string,
      projectName: row.project_name as string,
      lastModified: row.last_modified as string,
      messageCount: row.message_count as number,
      firstMessage: row.first_message as string | null,
      summaries: summariesConcat ? summariesConcat.split('|||') : [],
      customName: row.custom_name as string | null,
      isFavorite: row.is_favorite === 1,
      isArchived: row.is_archived === 1,
      note: row.note as string | null,
      tags: [], // Tags loaded separately if needed
    };
  }
}

// Export database instance for advanced operations
export { db };
export default DatabaseService;
