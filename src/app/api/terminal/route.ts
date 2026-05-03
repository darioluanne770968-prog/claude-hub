import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getHostById } from '@/lib/remote-hosts';
import { remapProjectPath, ensureSessionFileLink } from '@/lib/path-remap';

const execAsync = promisify(exec);

interface ResolvedCommand {
  command: string;
  remapped: boolean;
}

type Provider = 'claude' | 'codex';

function normalizeProvider(value: unknown): Provider {
  return value === 'codex' ? 'codex' : 'claude';
}

function buildResumeCommand(provider: Provider, sessionId: string, projectPath: string): string {
  if (provider === 'codex') {
    const rawSessionId = sessionId.startsWith('codex-') ? sessionId.slice('codex-'.length) : sessionId;
    return `cd "${projectPath}" && codex resume ${rawSessionId}`;
  }
  return `cd "${projectPath}" && claude -r ${sessionId}`;
}

function resolveCommand(
  sessionId: string,
  projectPath: string,
  hostId?: string | null,
  provider: Provider = 'claude',
  options: { createLink?: boolean } = {},
): ResolvedCommand | { error: string; status: number } {
  if (hostId) {
    const host = getHostById(hostId);
    if (!host) return { error: 'Remote host not found', status: 404 };

    const keyPath = host.privateKeyPath.replace('~', process.env.HOME || '');
    const resumeCommand = buildResumeCommand(provider, sessionId, projectPath);
    const command = `ssh -t -i "${keyPath}" -p ${host.port} ${host.username}@${host.hostname} '${resumeCommand.replace(/'/g, "'\\''")}'`;
    return { command, remapped: false };
  }

  const remap = remapProjectPath(projectPath);
  if (provider === 'claude' && remap.remapped && options.createLink) {
    ensureSessionFileLink(sessionId, remap.originalPath, remap.path);
  }
  return {
    command: buildResumeCommand(provider, sessionId, remap.path),
    remapped: remap.remapped,
  };
}

// GET: preview the (possibly remapped) command without executing it.
// Used by the UI to show the right command in the dropdown / clipboard.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');
  const projectPath = searchParams.get('projectPath');
  const hostId = searchParams.get('hostId');
  const provider = normalizeProvider(searchParams.get('provider'));

  if (!sessionId || !projectPath) {
    return NextResponse.json({ error: 'Missing sessionId or projectPath' }, { status: 400 });
  }

  const resolved = resolveCommand(sessionId, projectPath, hostId, provider);
  if ('error' in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  return NextResponse.json(resolved);
}

export async function POST(request: NextRequest) {
  try {
    const { sessionId, projectPath, hostId, provider: providerInput } = await request.json();
    const provider = normalizeProvider(providerInput);

    if (!sessionId || !projectPath) {
      return NextResponse.json({ error: 'Missing sessionId or projectPath' }, { status: 400 });
    }

    const resolved = resolveCommand(sessionId, projectPath, hostId, provider, { createLink: true });
    if ('error' in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }

    const appleScript = `
      tell application "Terminal"
        activate
        do script "${resolved.command.replace(/"/g, '\\"')}"
      end tell
    `;

    await execAsync(`osascript -e '${appleScript.replace(/'/g, "'\\''")}'`);

    return NextResponse.json({ success: true, ...resolved });
  } catch (error) {
    console.error('Failed to open terminal:', error);
    return NextResponse.json({ error: 'Failed to open terminal' }, { status: 500 });
  }
}
