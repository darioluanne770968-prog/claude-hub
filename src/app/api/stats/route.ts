import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

interface DailyStats {
  date: string;
  sessionCount: number;
  messageCount: number;
}

interface ProjectStats {
  name: string;
  sessionCount: number;
  messageCount: number;
  lastActive: string;
}

interface ToolStats {
  name: string;
  count: number;
}

interface Stats {
  totalSessions: number;
  totalMessages: number;
  totalProjects: number;
  toolUsage: ToolStats[];
  dailyActivity: DailyStats[];
  topProjects: ProjectStats[];
  averageMessagesPerSession: number;
  oldestSession: string;
  newestSession: string;
}

export async function GET() {
  const claudePath = path.join(os.homedir(), '.claude', 'projects');

  const stats: Stats = {
    totalSessions: 0,
    totalMessages: 0,
    totalProjects: 0,
    toolUsage: [],
    dailyActivity: [],
    topProjects: [],
    averageMessagesPerSession: 0,
    oldestSession: '',
    newestSession: '',
  };

  const toolCounts: Record<string, number> = {};
  const dailyMap: Record<string, { sessions: Set<string>; messages: number }> = {};
  const projectMap: Record<string, ProjectStats> = {};
  let oldestDate = new Date();
  let newestDate = new Date(0);

  try {
    if (!fs.existsSync(claudePath)) {
      return NextResponse.json(stats);
    }

    const projectDirs = fs.readdirSync(claudePath);
    stats.totalProjects = projectDirs.filter(d => !d.startsWith('.')).length;

    for (const projectDir of projectDirs) {
      if (projectDir.startsWith('.')) continue;

      const projectPath = path.join(claudePath, projectDir);
      const stat = fs.statSync(projectPath);
      if (!stat.isDirectory()) continue;

      const projectName = projectDir.split('-').pop() || projectDir;

      // Initialize project stats
      if (!projectMap[projectName]) {
        projectMap[projectName] = {
          name: projectName,
          sessionCount: 0,
          messageCount: 0,
          lastActive: '',
        };
      }

      // Find all .jsonl files
      const files = fs.readdirSync(projectPath);
      const sessionFiles = files.filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'));

      for (const sessionFile of sessionFiles) {
        stats.totalSessions++;
        projectMap[projectName].sessionCount++;

        const sessionPath = path.join(projectPath, sessionFile);

        try {
          const content = fs.readFileSync(sessionPath, 'utf8');
          const lines = content.trim().split('\n');
          let sessionMessageCount = 0;
          let sessionDate = '';

          for (const line of lines) {
            if (!line.trim()) continue;

            try {
              const entry = JSON.parse(line);

              // Count messages
              if (entry.type === 'user' || entry.type === 'assistant') {
                stats.totalMessages++;
                sessionMessageCount++;
                projectMap[projectName].messageCount++;

                // Track daily activity
                if (entry.timestamp) {
                  const date = entry.timestamp.split('T')[0];
                  sessionDate = date;

                  if (!dailyMap[date]) {
                    dailyMap[date] = { sessions: new Set(), messages: 0 };
                  }
                  dailyMap[date].sessions.add(sessionFile);
                  dailyMap[date].messages++;

                  const entryDate = new Date(entry.timestamp);
                  if (entryDate < oldestDate) oldestDate = entryDate;
                  if (entryDate > newestDate) newestDate = entryDate;

                  if (!projectMap[projectName].lastActive || date > projectMap[projectName].lastActive) {
                    projectMap[projectName].lastActive = date;
                  }
                }
              }

              // Count tool usage
              if (entry.type === 'assistant' && entry.message?.content) {
                const content = Array.isArray(entry.message.content)
                  ? entry.message.content
                  : [];

                for (const block of content) {
                  if (block.type === 'tool_use' && block.name) {
                    toolCounts[block.name] = (toolCounts[block.name] || 0) + 1;
                  }
                }
              }
            } catch {
              // Skip invalid JSON
            }
          }
        } catch (err) {
          console.error(`Failed to read session ${sessionFile}:`, err);
        }
      }
    }

    // Calculate averages
    stats.averageMessagesPerSession = stats.totalSessions > 0
      ? Math.round(stats.totalMessages / stats.totalSessions)
      : 0;

    // Format dates
    stats.oldestSession = oldestDate.toISOString().split('T')[0];
    stats.newestSession = newestDate.toISOString().split('T')[0];

    // Convert tool counts to sorted array
    stats.toolUsage = Object.entries(toolCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Convert daily map to sorted array (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    stats.dailyActivity = Object.entries(dailyMap)
      .filter(([date]) => new Date(date) >= thirtyDaysAgo)
      .map(([date, data]) => ({
        date,
        sessionCount: data.sessions.size,
        messageCount: data.messages,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Top projects by message count
    stats.topProjects = Object.values(projectMap)
      .sort((a, b) => b.messageCount - a.messageCount)
      .slice(0, 10);

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Failed to gather stats:', error);
    return NextResponse.json(stats);
  }
}
