import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

interface FileChange {
  path: string;
  action: 'read' | 'write' | 'edit' | 'create' | 'delete';
  tool: string;
  timestamp?: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const claudePath = path.join(os.homedir(), '.claude', 'projects');

  try {
    const projectDirs = fs.readdirSync(claudePath);

    for (const projectDir of projectDirs) {
      if (projectDir.startsWith('.')) continue;

      const projectPath = path.join(claudePath, projectDir);
      const stat = fs.statSync(projectPath);
      if (!stat.isDirectory()) continue;

      const sessionFile = path.join(projectPath, `${id}.jsonl`);
      if (fs.existsSync(sessionFile)) {
        const content = fs.readFileSync(sessionFile, 'utf8');
        const lines = content.trim().split('\n');

        const fileChanges: FileChange[] = [];
        const filesRead = new Set<string>();
        const filesWritten = new Set<string>();
        const filesEdited = new Set<string>();
        const filesCreated = new Set<string>();

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const entry = JSON.parse(line);

            // Check for tool uses
            if (entry.message?.content) {
              const content = entry.message.content;
              if (Array.isArray(content)) {
                for (const item of content) {
                  if (item.type === 'tool_use') {
                    const toolName = item.name;
                    const input = item.input || {};

                    let filePath = input.file_path || input.path || input.filePath;
                    if (!filePath) continue;

                    // Normalize path for display
                    if (filePath.startsWith(os.homedir())) {
                      filePath = '~' + filePath.slice(os.homedir().length);
                    }

                    const change: FileChange = {
                      path: filePath,
                      action: 'read',
                      tool: toolName,
                      timestamp: entry.timestamp,
                    };

                    switch (toolName) {
                      case 'Read':
                        change.action = 'read';
                        filesRead.add(filePath);
                        break;
                      case 'Write':
                        change.action = 'write';
                        filesWritten.add(filePath);
                        filesCreated.add(filePath);
                        break;
                      case 'Edit':
                        change.action = 'edit';
                        filesEdited.add(filePath);
                        break;
                      case 'Glob':
                      case 'Grep':
                        continue; // Skip search tools
                      default:
                        continue;
                    }

                    fileChanges.push(change);
                  }
                }
              }
            }
          } catch {
            // Skip invalid JSON
          }
        }

        // Calculate statistics
        const uniqueFilesModified = new Set([...filesWritten, ...filesEdited]);

        return NextResponse.json({
          changes: fileChanges,
          summary: {
            totalOperations: fileChanges.length,
            filesRead: filesRead.size,
            filesWritten: filesWritten.size,
            filesEdited: filesEdited.size,
            filesCreated: filesCreated.size,
            uniqueFilesModified: uniqueFilesModified.size,
          },
          files: {
            read: Array.from(filesRead),
            written: Array.from(filesWritten),
            edited: Array.from(filesEdited),
            created: Array.from(filesCreated),
            modified: Array.from(uniqueFilesModified),
          },
        });
      }
    }

    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  } catch (error) {
    console.error('Failed to analyze file changes:', error);
    return NextResponse.json({ error: 'Failed to analyze' }, { status: 500 });
  }
}
