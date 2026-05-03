import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const USER_DATA_FILE = path.join(os.homedir(), '.claude', 'claude-hub-user-data.json');
const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');

// Find session file and append /rename command to sync with Claude CLI
function syncRenameToSessionFile(sessionId: string, newName: string | null): boolean {
  try {
    const projectDirs = fs.readdirSync(PROJECTS_DIR);

    for (const dir of projectDirs) {
      if (dir.startsWith('.')) continue;

      const projectDir = path.join(PROJECTS_DIR, dir);
      const stat = fs.statSync(projectDir);
      if (!stat.isDirectory()) continue;

      const sessionFile = path.join(projectDir, `${sessionId}.jsonl`);
      if (fs.existsSync(sessionFile)) {
        // Claude Code's title persistence is the `custom-title` / `agent-name` entries —
        // those are what `claude --resume` reads on startup to set the session title.
        // The <local-command-stdout> line is just the UI echo of /rename and is
        // optional; we keep it so the conversation log looks identical to a real
        // terminal rename.
        const ts = new Date().toISOString();
        const title = newName ?? '';
        const stdoutEntry = {
          type: 'system',
          subtype: 'local_command',
          content: `<local-command-stdout>Session renamed to: ${title}</local-command-stdout>`,
          level: 'info',
          timestamp: ts,
          uuid: crypto.randomUUID(),
          isMeta: false,
          sessionId,
        };
        const customTitleEntry = {
          type: 'custom-title',
          customTitle: title,
          sessionId,
        };
        const agentNameEntry = {
          type: 'agent-name',
          agentName: title,
          sessionId,
        };

        const fileContent = fs.readFileSync(sessionFile, 'utf8');
        const needsLeadingNewline = fileContent.length > 0 && !fileContent.endsWith('\n');
        const entriesToAppend = (needsLeadingNewline ? '\n' : '') +
          JSON.stringify(stdoutEntry) + '\n' +
          JSON.stringify(customTitleEntry) + '\n' +
          JSON.stringify(agentNameEntry) + '\n';
        fs.appendFileSync(sessionFile, entriesToAppend);
        return true;
      }
    }
    return false;
  } catch (error) {
    console.error('Failed to sync rename to session file:', error);
    return false;
  }
}

export interface UserData {
  favorites: string[]; // Session IDs
  archived: string[]; // Session IDs
  customNames: Record<string, string>; // sessionId -> custom name
  notes: Record<string, string>; // sessionId -> note
  templates: Array<{
    id: string;
    name: string;
    content: string;
    createdAt: string;
  }>;
  webhooks: Array<{
    id: string;
    name: string;
    url: string;
    events: string[];
    enabled: boolean;
  }>;
  settings: {
    autoBackup?: boolean;
    backupPath?: string;
    redactionRules?: string[];
  };
}

function loadUserData(): UserData {
  try {
    if (fs.existsSync(USER_DATA_FILE)) {
      const content = fs.readFileSync(USER_DATA_FILE, 'utf8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error('Failed to load user data:', error);
  }
  return {
    favorites: [],
    archived: [],
    customNames: {},
    notes: {},
    templates: [],
    webhooks: [],
    settings: {},
  };
}

function saveUserData(data: UserData) {
  const dir = path.dirname(USER_DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(USER_DATA_FILE, JSON.stringify(data, null, 2));
}

// GET - Get all user data or specific field
export async function GET(request: NextRequest) {
  const field = request.nextUrl.searchParams.get('field');
  const sessionId = request.nextUrl.searchParams.get('sessionId');
  const data = loadUserData();

  if (sessionId) {
    // Return data for specific session
    return NextResponse.json({
      isFavorite: data.favorites.includes(sessionId),
      isArchived: data.archived.includes(sessionId),
      customName: data.customNames[sessionId] || null,
      note: data.notes[sessionId] || null,
    });
  }

  if (field && field in data) {
    return NextResponse.json({ [field]: data[field as keyof UserData] });
  }

  return NextResponse.json(data);
}

// POST - Update user data
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, sessionId, value } = body;
    const data = loadUserData();

    switch (action) {
      case 'toggleFavorite':
        if (data.favorites.includes(sessionId)) {
          data.favorites = data.favorites.filter(id => id !== sessionId);
        } else {
          data.favorites.unshift(sessionId);
        }
        break;

      case 'toggleArchive':
        if (data.archived.includes(sessionId)) {
          data.archived = data.archived.filter(id => id !== sessionId);
        } else {
          data.archived.push(sessionId);
          // Remove from favorites if archived
          data.favorites = data.favorites.filter(id => id !== sessionId);
        }
        break;

      case 'setCustomName':
        if (value) {
          data.customNames[sessionId] = value;
        } else {
          delete data.customNames[sessionId];
        }
        // Sync to session file so Claude CLI also shows the new name
        syncRenameToSessionFile(sessionId, value || null);
        break;

      case 'setNote':
        if (value) {
          data.notes[sessionId] = value;
        } else {
          delete data.notes[sessionId];
        }
        break;

      case 'addTemplate':
        data.templates.push({
          id: Date.now().toString(),
          name: value.name,
          content: value.content,
          createdAt: new Date().toISOString(),
        });
        break;

      case 'deleteTemplate':
        data.templates = data.templates.filter(t => t.id !== value);
        break;

      case 'addWebhook':
        data.webhooks.push({
          id: Date.now().toString(),
          name: value.name,
          url: value.url,
          events: value.events || ['session.complete'],
          enabled: true,
        });
        break;

      case 'toggleWebhook':
        const webhook = data.webhooks.find(w => w.id === value);
        if (webhook) {
          webhook.enabled = !webhook.enabled;
        }
        break;

      case 'deleteWebhook':
        data.webhooks = data.webhooks.filter(w => w.id !== value);
        break;

      case 'updateSettings':
        data.settings = { ...data.settings, ...value };
        break;

      case 'batchArchive':
        // value is array of session IDs
        for (const id of value) {
          if (!data.archived.includes(id)) {
            data.archived.push(id);
          }
          data.favorites = data.favorites.filter(fid => fid !== id);
        }
        break;

      case 'batchDelete':
        // This just removes from our tracking, actual delete is separate
        data.favorites = data.favorites.filter(id => !value.includes(id));
        data.archived = data.archived.filter(id => !value.includes(id));
        for (const id of value) {
          delete data.customNames[id];
          delete data.notes[id];
        }
        break;

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    saveUserData(data);

    return NextResponse.json({
      success: true,
      data: {
        isFavorite: data.favorites.includes(sessionId),
        isArchived: data.archived.includes(sessionId),
        customName: data.customNames[sessionId] || null,
        note: data.notes[sessionId] || null,
      },
    });
  } catch (error) {
    console.error('Failed to update user data:', error);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}
