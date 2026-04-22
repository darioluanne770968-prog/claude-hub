import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { analyzeSession, formatCost, formatTokens, PRICING } from '@/lib/token-estimator';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const claudePath = path.join(os.homedir(), '.claude', 'projects');

  try {
    // Find the session file
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
        const messages: Array<{
          type: string;
          role?: string;
          message?: { content: string | Array<{ text?: string }> };
        }> = [];

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const entry = JSON.parse(line);
            if (entry.type === 'user' || entry.type === 'assistant') {
              messages.push(entry);
            }
          } catch {
            // Skip invalid JSON
          }
        }

        const stats = analyzeSession(messages);

        return NextResponse.json({
          ...stats,
          formattedInputTokens: formatTokens(stats.inputTokens),
          formattedOutputTokens: formatTokens(stats.outputTokens),
          formattedTotalTokens: formatTokens(stats.totalTokens),
          formattedCost: formatCost(stats.estimatedCost),
          pricing: PRICING['default'],
        });
      }
    }

    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  } catch (error) {
    console.error('Failed to calculate token stats:', error);
    return NextResponse.json({ error: 'Failed to calculate stats' }, { status: 500 });
  }
}
