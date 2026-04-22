import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';
import { DatabaseService } from './database';

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const PROJECTS_FILE = path.join(CLAUDE_DIR, 'projects.json');

interface ProjectEntry {
  projectPath: string;
  lastModified?: string;
}

interface SessionSummary {
  summary?: string;
  leafSummary?: string;
}

// Get all project paths from projects.json
function getProjectPaths(): string[] {
  if (!fs.existsSync(PROJECTS_FILE)) return [];

  try {
    const data = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf-8'));
    const paths: string[] = [];

    for (const [projectPath, entry] of Object.entries(data)) {
      if (typeof entry === 'object' && entry !== null) {
        paths.push(projectPath);
      }
    }

    return paths;
  } catch {
    return [];
  }
}

// Get session directory for a project
function getSessionDir(projectPath: string): string {
  const hash = Buffer.from(projectPath).toString('base64').replace(/[/+=]/g, '_');
  return path.join(CLAUDE_DIR, 'projects', hash);
}

// Parse session metadata from JSONL file
async function parseSessionMetadata(sessionPath: string): Promise<{
  summaries: string[];
  firstMessage?: string;
  messageCount: number;
  lastModified: string;
} | null> {
  if (!fs.existsSync(sessionPath)) return null;

  const summaries: string[] = [];
  let firstMessage: string | undefined;
  let messageCount = 0;

  try {
    const stats = fs.statSync(sessionPath);
    const lastModified = stats.mtime.toISOString();

    const fileStream = fs.createReadStream(sessionPath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (!line.trim()) continue;

      try {
        const entry = JSON.parse(line);

        // Count messages
        if (entry.type === 'user' || entry.type === 'assistant') {
          messageCount++;
        }

        // Get first user message
        if (!firstMessage && entry.type === 'user' && entry.message?.content) {
          const content = entry.message.content;
          if (Array.isArray(content)) {
            const textBlock = content.find((c: { type: string }) => c.type === 'text');
            if (textBlock?.text) {
              firstMessage = textBlock.text.slice(0, 200);
            }
          } else if (typeof content === 'string') {
            firstMessage = content.slice(0, 200);
          }
        }

        // Get summaries
        if (entry.type === 'summary') {
          const summaryData = entry as SessionSummary;
          if (summaryData.leafSummary) {
            summaries.push(summaryData.leafSummary);
          } else if (summaryData.summary) {
            summaries.push(summaryData.summary);
          }
        }
      } catch {
        // Skip invalid JSON lines
      }
    }

    return { summaries, firstMessage, messageCount, lastModified };
  } catch (error) {
    console.error(`Error parsing session ${sessionPath}:`, error);
    return null;
  }
}

// Sync all sessions to database
export async function syncAllSessions(options?: { force?: boolean }): Promise<{
  synced: number;
  errors: number;
  duration: number;
}> {
  const startTime = Date.now();
  let synced = 0;
  let errors = 0;

  console.log('[DB Sync] Starting session sync...');

  const projectPaths = getProjectPaths();
  console.log(`[DB Sync] Found ${projectPaths.length} projects`);

  for (const projectPath of projectPaths) {
    const sessionDir = getSessionDir(projectPath);
    if (!fs.existsSync(sessionDir)) continue;

    const files = fs.readdirSync(sessionDir);
    const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));

    for (const file of jsonlFiles) {
      const sessionId = file.replace('.jsonl', '');
      const sessionPath = path.join(sessionDir, file);

      try {
        const metadata = await parseSessionMetadata(sessionPath);
        if (!metadata) continue;

        // Check if we need to update (skip if not forced and already synced)
        if (!options?.force) {
          const existing = DatabaseService.getSession(sessionId);
          if (existing && existing.lastModified === metadata.lastModified) {
            continue; // Already up to date
          }
        }

        // Get existing user data (favorites, tags, etc.)
        const existing = DatabaseService.getSession(sessionId);

        DatabaseService.upsertSession({
          id: sessionId,
          projectPath,
          projectName: path.basename(projectPath),
          lastModified: metadata.lastModified,
          messageCount: metadata.messageCount,
          firstMessage: metadata.firstMessage,
          summaries: metadata.summaries.length > 0 ? metadata.summaries : ['New session'],
          customName: existing?.customName || undefined,
          isFavorite: existing?.isFavorite || false,
          isArchived: existing?.isArchived || false,
          note: existing?.note || undefined,
        });

        synced++;
      } catch (error) {
        console.error(`[DB Sync] Error syncing session ${sessionId}:`, error);
        errors++;
      }
    }
  }

  const duration = Date.now() - startTime;
  console.log(`[DB Sync] Completed: ${synced} synced, ${errors} errors, ${duration}ms`);

  return { synced, errors, duration };
}

// Sync a single session
export async function syncSession(sessionId: string, projectPath: string): Promise<boolean> {
  const sessionDir = getSessionDir(projectPath);
  const sessionPath = path.join(sessionDir, `${sessionId}.jsonl`);

  try {
    const metadata = await parseSessionMetadata(sessionPath);
    if (!metadata) return false;

    const existing = DatabaseService.getSession(sessionId);

    DatabaseService.upsertSession({
      id: sessionId,
      projectPath,
      projectName: path.basename(projectPath),
      lastModified: metadata.lastModified,
      messageCount: metadata.messageCount,
      firstMessage: metadata.firstMessage,
      summaries: metadata.summaries.length > 0 ? metadata.summaries : ['New session'],
      customName: existing?.customName || undefined,
      isFavorite: existing?.isFavorite || false,
      isArchived: existing?.isArchived || false,
      note: existing?.note || undefined,
    });

    return true;
  } catch (error) {
    console.error(`[DB Sync] Error syncing session ${sessionId}:`, error);
    return false;
  }
}

// Get sync status
export function getSyncStatus(): { lastSync?: string; sessionCount: number; projectCount: number } {
  const stats = DatabaseService.getStats();
  return {
    sessionCount: stats.total_sessions,
    projectCount: stats.total_projects,
  };
}
