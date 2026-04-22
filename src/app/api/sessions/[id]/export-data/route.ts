import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const PROJECTS_FILE = path.join(CLAUDE_DIR, 'projects.json');

interface Message {
  type: string;
  timestamp?: string;
  message?: {
    role?: string;
    content?: unknown;
  };
}

function getSessionPath(sessionId: string): string | null {
  if (!fs.existsSync(PROJECTS_FILE)) return null;

  const projects = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf-8'));

  for (const projectPath of Object.keys(projects)) {
    const hash = Buffer.from(projectPath).toString('base64').replace(/[/+=]/g, '_');
    const sessionDir = path.join(CLAUDE_DIR, 'projects', hash);
    const sessionFile = path.join(sessionDir, `${sessionId}.jsonl`);

    if (fs.existsSync(sessionFile)) {
      return sessionFile;
    }
  }

  return null;
}

async function parseSession(sessionPath: string): Promise<{
  messages: Array<{
    role: string;
    content: string;
    timestamp?: string;
    toolUse?: unknown;
  }>;
  metadata: {
    messageCount: number;
    firstMessage?: string;
    lastModified: string;
  };
}> {
  const messages: Array<{
    role: string;
    content: string;
    timestamp?: string;
    toolUse?: unknown;
  }> = [];

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
      const entry = JSON.parse(line) as Message;

      if (entry.type === 'user' || entry.type === 'assistant') {
        let content = '';
        let toolUse = undefined;

        if (entry.message?.content) {
          if (Array.isArray(entry.message.content)) {
            for (const block of entry.message.content) {
              if ((block as { type: string }).type === 'text') {
                content += (block as { text: string }).text;
              } else if ((block as { type: string }).type === 'tool_use') {
                toolUse = block;
              }
            }
          } else if (typeof entry.message.content === 'string') {
            content = entry.message.content;
          }
        }

        messages.push({
          role: entry.type,
          content,
          timestamp: entry.timestamp,
          toolUse,
        });
      }
    } catch {
      // Skip invalid lines
    }
  }

  return {
    messages,
    metadata: {
      messageCount: messages.length,
      firstMessage: messages[0]?.content?.slice(0, 200),
      lastModified,
    },
  };
}

function convertToCSV(messages: Array<{ role: string; content: string; timestamp?: string }>): string {
  const header = 'timestamp,role,content\n';
  const rows = messages.map(msg => {
    const timestamp = msg.timestamp || '';
    const role = msg.role;
    // Escape quotes and wrap in quotes
    const content = `"${(msg.content || '').replace(/"/g, '""')}"`;
    return `${timestamp},${role},${content}`;
  }).join('\n');

  return header + rows;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format') || 'json';

  try {
    const sessionPath = getSessionPath(id);
    if (!sessionPath) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const { messages, metadata } = await parseSession(sessionPath);

    if (format === 'csv') {
      const csv = convertToCSV(messages);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="session-${id.slice(0, 8)}.csv"`,
        },
      });
    }

    // JSON format
    const data = {
      sessionId: id,
      exportedAt: new Date().toISOString(),
      metadata,
      messages,
    };

    if (searchParams.get('download') === 'true') {
      return new NextResponse(JSON.stringify(data, null, 2), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="session-${id.slice(0, 8)}.json"`,
        },
      });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ error: 'Failed to export session' }, { status: 500 });
  }
}
