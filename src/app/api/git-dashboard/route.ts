import { NextResponse } from 'next/server';
import path from 'path';
import os from 'os';
import { scanGitProjects } from '@/lib/git-status';

export const dynamic = 'force-dynamic';

export async function GET() {
  const rootDir = path.join(os.homedir(), 'claudeProjects');
  try {
    const projects = await scanGitProjects(rootDir);
    return NextResponse.json({ rootDir, projects });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
