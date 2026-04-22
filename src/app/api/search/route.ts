import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

interface SearchResult {
  sessionId: string;
  projectName: string;
  projectPath: string;
  matchedText: string;
  messageType: 'user' | 'assistant';
  timestamp: string;
  context: string;
}

// Search through all local sessions
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.toLowerCase();
  const limit = parseInt(searchParams.get('limit') || '50');

  if (!query || query.length < 2) {
    return NextResponse.json({ results: [], error: 'Query must be at least 2 characters' });
  }

  const results: SearchResult[] = [];
  const claudePath = path.join(os.homedir(), '.claude', 'projects');

  try {
    if (!fs.existsSync(claudePath)) {
      return NextResponse.json({ results: [] });
    }

    const projectDirs = fs.readdirSync(claudePath);

    for (const projectDir of projectDirs) {
      if (projectDir.startsWith('.')) continue;

      const projectPath = path.join(claudePath, projectDir);
      const stats = fs.statSync(projectPath);
      if (!stats.isDirectory()) continue;

      // Get project name from directory name
      // Format: -Users-hui-ClaudeProjects-projectname -> projectname
      const projectName = projectDir.split('-').pop() || projectDir;

      // Find all .jsonl files in the project directory
      const files = fs.readdirSync(projectPath);
      const sessionFiles = files.filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'));

      for (const sessionFile of sessionFiles) {
        if (results.length >= limit) break;

        const sessionId = sessionFile.replace('.jsonl', '');
        const sessionPath = path.join(projectPath, sessionFile);

        try {
          const content = fs.readFileSync(sessionPath, 'utf8');
          const lines = content.trim().split('\n');

          for (const line of lines) {
            if (results.length >= limit) break;
            if (!line.trim()) continue;

            try {
              const entry = JSON.parse(line);

              // Search in user messages
              if (entry.type === 'user' && entry.message?.content) {
                const messageContent = typeof entry.message.content === 'string'
                  ? entry.message.content
                  : JSON.stringify(entry.message.content);

                if (messageContent.toLowerCase().includes(query)) {
                  const matchIndex = messageContent.toLowerCase().indexOf(query);
                  const start = Math.max(0, matchIndex - 50);
                  const end = Math.min(messageContent.length, matchIndex + query.length + 50);
                  const context = (start > 0 ? '...' : '') +
                    messageContent.slice(start, end) +
                    (end < messageContent.length ? '...' : '');

                  results.push({
                    sessionId,
                    projectName,
                    projectPath: projectDir,
                    matchedText: messageContent.slice(matchIndex, matchIndex + query.length),
                    messageType: 'user',
                    timestamp: entry.timestamp || '',
                    context,
                  });
                }
              }

              // Search in assistant messages
              if (entry.type === 'assistant' && entry.message?.content) {
                const contentArray = Array.isArray(entry.message.content)
                  ? entry.message.content
                  : [{ type: 'text', text: entry.message.content }];

                for (const block of contentArray) {
                  if (results.length >= limit) break;
                  if (block.type === 'text' && block.text) {
                    const text = block.text;
                    if (text.toLowerCase().includes(query)) {
                      const matchIndex = text.toLowerCase().indexOf(query);
                      const start = Math.max(0, matchIndex - 50);
                      const end = Math.min(text.length, matchIndex + query.length + 50);
                      const context = (start > 0 ? '...' : '') +
                        text.slice(start, end) +
                        (end < text.length ? '...' : '');

                      results.push({
                        sessionId,
                        projectName,
                        projectPath: projectDir,
                        matchedText: text.slice(matchIndex, matchIndex + query.length),
                        messageType: 'assistant',
                        timestamp: entry.timestamp || '',
                        context,
                      });
                    }
                  }
                }
              }
            } catch {
              // Skip invalid JSON lines
            }
          }
        } catch (err) {
          console.error(`Failed to read session ${sessionFile}:`, err);
        }
      }
    }

    return NextResponse.json({
      results,
      total: results.length,
      query,
    });
  } catch (error) {
    console.error('Search failed:', error);
    return NextResponse.json(
      { error: 'Search failed', results: [] },
      { status: 500 }
    );
  }
}
