import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { commitAndPush, pullRepo } from '@/lib/git-status';

export async function POST(request: NextRequest) {
  try {
    const { path: repoPath, message, action } = await request.json();

    if (!repoPath || typeof repoPath !== 'string') {
      return NextResponse.json({ error: 'Missing path' }, { status: 400 });
    }

    const allowedRoot = path.join(os.homedir(), 'claudeProjects');
    const resolved = path.resolve(repoPath);
    if (!resolved.startsWith(allowedRoot + path.sep)) {
      return NextResponse.json(
        { error: `Path must be under ${allowedRoot}` },
        { status: 403 },
      );
    }
    if (!fs.existsSync(path.join(resolved, '.git'))) {
      return NextResponse.json({ error: 'Not a git repo' }, { status: 400 });
    }

    if (action === 'pull') {
      const result = await pullRepo(resolved);
      return NextResponse.json(result, { status: result.success ? 200 : 500 });
    }

    const msg = (typeof message === 'string' && message.trim()) ? message.trim() : null;
    const result = await commitAndPush(resolved, msg);
    return NextResponse.json(result, { status: result.success ? 200 : 500 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
