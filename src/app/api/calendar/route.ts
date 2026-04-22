import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

interface SessionInfo {
  id: string;
  projectName: string;
  summary: string;
  messageCount: number;
}

interface DayData {
  date: string;
  sessions: SessionInfo[];
  messageCount: number;
}

export async function GET() {
  const claudePath = path.join(os.homedir(), '.claude', 'projects');
  const days: Record<string, DayData> = {};

  try {
    if (!fs.existsSync(claudePath)) {
      return NextResponse.json({ days: {} });
    }

    const projectDirs = fs.readdirSync(claudePath);

    for (const projectDir of projectDirs) {
      if (projectDir.startsWith('.')) continue;

      const projectPath = path.join(claudePath, projectDir);
      const stat = fs.statSync(projectPath);
      if (!stat.isDirectory()) continue;

      const projectName = projectDir.split('-').pop() || projectDir;

      // Find all .jsonl files
      const files = fs.readdirSync(projectPath);
      const sessionFiles = files.filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'));

      for (const sessionFile of sessionFiles) {
        const sessionId = sessionFile.replace('.jsonl', '');
        const sessionPath = path.join(projectPath, sessionFile);

        try {
          const content = fs.readFileSync(sessionPath, 'utf8');
          const lines = content.trim().split('\n');

          let summary = '';
          let messageCount = 0;
          let sessionDate = '';

          for (const line of lines) {
            if (!line.trim()) continue;

            try {
              const entry = JSON.parse(line);

              // Get first date from messages
              if (entry.timestamp && !sessionDate) {
                sessionDate = entry.timestamp.split('T')[0];
              }

              // Count messages
              if (entry.type === 'user' || entry.type === 'assistant') {
                messageCount++;
              }

              // Get summary
              if (entry.type === 'summary' && entry.summary && !summary) {
                summary = entry.summary;
              }

              // Get first user message as fallback summary
              if (!summary && entry.type === 'user' && entry.message?.content) {
                const msgContent = typeof entry.message.content === 'string'
                  ? entry.message.content
                  : '';
                if (msgContent) {
                  summary = msgContent.slice(0, 100);
                }
              }
            } catch {
              // Skip invalid JSON
            }
          }

          // Add to calendar data
          if (sessionDate) {
            if (!days[sessionDate]) {
              days[sessionDate] = {
                date: sessionDate,
                sessions: [],
                messageCount: 0,
              };
            }

            days[sessionDate].sessions.push({
              id: sessionId,
              projectName,
              summary,
              messageCount,
            });
            days[sessionDate].messageCount += messageCount;
          }
        } catch (err) {
          console.error(`Failed to read session ${sessionFile}:`, err);
        }
      }
    }

    return NextResponse.json({ days });
  } catch (error) {
    console.error('Failed to get calendar data:', error);
    return NextResponse.json({ days: {} });
  }
}
