import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

const CLAUDE_PATH = path.join(os.homedir(), '.claude');

// Create a backup of all Claude Hub data
export async function POST(request: NextRequest) {
  try {
    const { format = 'json' } = await request.json().catch(() => ({}));

    const backupData: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      version: '1.0',
    };

    // Backup user data
    const userDataFile = path.join(CLAUDE_PATH, 'claude-hub-user-data.json');
    if (fs.existsSync(userDataFile)) {
      backupData.userData = JSON.parse(fs.readFileSync(userDataFile, 'utf8'));
    }

    // Backup tags
    const tagsFile = path.join(CLAUDE_PATH, 'claude-hub-tags.json');
    if (fs.existsSync(tagsFile)) {
      backupData.tags = JSON.parse(fs.readFileSync(tagsFile, 'utf8'));
    }

    // Backup session summaries (not full content to keep backup small)
    const projectsPath = path.join(CLAUDE_PATH, 'projects');
    if (fs.existsSync(projectsPath)) {
      const sessions: Array<{
        id: string;
        project: string;
        summary: string;
        messageCount: number;
      }> = [];

      const projectDirs = fs.readdirSync(projectsPath);
      for (const projectDir of projectDirs) {
        if (projectDir.startsWith('.')) continue;
        const projectPath = path.join(projectsPath, projectDir);
        if (!fs.statSync(projectPath).isDirectory()) continue;

        const files = fs.readdirSync(projectPath);
        for (const file of files) {
          if (!file.endsWith('.jsonl')) continue;
          const sessionId = file.replace('.jsonl', '');
          const sessionPath = path.join(projectPath, file);

          try {
            const content = fs.readFileSync(sessionPath, 'utf8');
            const lines = content.trim().split('\n');
            let summary = '';
            let messageCount = 0;

            for (const line of lines) {
              try {
                const entry = JSON.parse(line);
                if (entry.type === 'summary') summary = entry.summary;
                if (entry.type === 'user' || entry.type === 'assistant') messageCount++;
              } catch {}
            }

            sessions.push({
              id: sessionId,
              project: projectDir,
              summary,
              messageCount,
            });
          } catch {}
        }
      }

      backupData.sessions = sessions;
    }

    const filename = `claude-hub-backup-${new Date().toISOString().split('T')[0]}.json`;

    return new NextResponse(JSON.stringify(backupData, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Failed to create backup:', error);
    return NextResponse.json({ error: 'Failed to create backup' }, { status: 500 });
  }
}

// Restore from backup
export async function PUT(request: NextRequest) {
  try {
    const backupData = await request.json();

    if (!backupData.version) {
      return NextResponse.json({ error: 'Invalid backup file' }, { status: 400 });
    }

    // Restore user data
    if (backupData.userData) {
      const userDataFile = path.join(CLAUDE_PATH, 'claude-hub-user-data.json');
      fs.writeFileSync(userDataFile, JSON.stringify(backupData.userData, null, 2));
    }

    // Restore tags
    if (backupData.tags) {
      const tagsFile = path.join(CLAUDE_PATH, 'claude-hub-tags.json');
      fs.writeFileSync(tagsFile, JSON.stringify(backupData.tags, null, 2));
    }

    return NextResponse.json({
      success: true,
      message: 'Backup restored successfully',
      restored: {
        userData: !!backupData.userData,
        tags: !!backupData.tags,
      },
    });
  } catch (error) {
    console.error('Failed to restore backup:', error);
    return NextResponse.json({ error: 'Failed to restore backup' }, { status: 500 });
  }
}
