import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { getSessionById } from '@/lib/claude-sessions';

const TMUX = process.env.CLAUDE_HUB_TMUX || '/opt/homebrew/bin/tmux';
const CLAUDE = process.env.CLAUDE_HUB_CLAUDE_BIN || '/opt/homebrew/bin/claude';

const URL_RE = /https:\/\/claude\.ai\/code\/[A-Za-z0-9_\-]+/;
// Only matches when these strings appear at the START of a line in the pane's
// bottom region (real zsh/bash error format, not session-content false positives).
const FAIL_RE = /^(?:zsh|bash): (?:no such file or directory|command not found):|^No conversation found/m;

function tmuxName(sessionId: string): string {
  return `rc-${sessionId.slice(0, 8)}`;
}

function run(cmd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
    child.on('error', () => resolve({ code: -1, stdout, stderr }));
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function tmuxHas(name: string): Promise<boolean> {
  const r = await run(TMUX, ['has-session', '-t', name]);
  return r.code === 0;
}

async function tmuxKill(name: string): Promise<void> {
  await run(TMUX, ['kill-session', '-t', name]);
}

async function tmuxCapture(name: string): Promise<string> {
  const r = await run(TMUX, ['capture-pane', '-t', name, '-p', '-S', '-300']);
  return r.code === 0 ? r.stdout : '';
}

// Take the LAST URL in the pane — `claude --resume` replays scrollback that
// can contain URLs from prior /remote-control runs. We want the freshly-issued
// one, which is at the bottom (newest timeline position).
function lastUrl(text: string): string | null {
  const re = /https:\/\/claude\.ai\/code\/[A-Za-z0-9_\-]+/g;
  const all = text.match(re);
  return all ? all[all.length - 1] : null;
}

async function waitForUrl(name: string, timeoutMs: number, baselineUrl: string | null): Promise<string | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!(await tmuxHas(name))) return null;
    const pane = await tmuxCapture(name);
    const u = lastUrl(pane);
    // Only accept a URL different from baseline (the pre-/remote-control state).
    // This guarantees we return the URL just generated, not one from history.
    if (u && u !== baselineUrl) return u;
    await sleep(500);
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const { sessionId } = await request.json();
    if (!sessionId) {
      return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
    }

    const session = await getSessionById(sessionId);
    if (!session) {
      return NextResponse.json({ error: `Session not found: ${sessionId}` }, { status: 404 });
    }
    // originalProjectPath is the cwd Claude was originally invoked from — required
    // for `claude --resume` to find the session file under ~/.claude/projects/.
    const cwd = session.originalProjectPath;

    const name = tmuxName(sessionId);

    if (await tmuxHas(name)) await tmuxKill(name);

    const created = await run(TMUX, [
      'new-session', '-d', '-s', name, '-c', cwd, '-x', '200', '-y', '50',
    ]);
    if (created.code !== 0) {
      return NextResponse.json(
        { error: `tmux new-session failed: ${created.stderr || created.stdout}` },
        { status: 500 }
      );
    }

    // Let the shell finish initializing before we type anything
    await sleep(1500);

    const resumeCmd = `${CLAUDE} --resume ${sessionId}`;
    await run(TMUX, ['send-keys', '-t', name, resumeCmd, 'Enter']);

    // Wait for Claude Code TUI to come up
    await sleep(5000);

    // Fast-fail: only check the last ~10 lines (prompt region) so resumed-session
    // scrollback content doesn't trigger false positives.
    const earlyPane = await tmuxCapture(name);
    const earlyTail = earlyPane.split('\n').slice(-10).join('\n');
    if (FAIL_RE.test(earlyTail)) {
      await tmuxKill(name);
      return NextResponse.json(
        { error: 'claude --resume 启动失败', pane: earlyPane.slice(-1500), cwd },
        { status: 502 }
      );
    }

    // Snapshot any URL already in scrollback so we can ignore it when polling
    const baselineUrl = lastUrl(earlyPane);

    await run(TMUX, ['send-keys', '-t', name, '/remote-control', 'Enter']);

    const url = await waitForUrl(name, 25000, baselineUrl);
    if (!url) {
      const pane = await tmuxCapture(name);
      await tmuxKill(name);
      return NextResponse.json(
        { error: '等待 /remote-control URL 超时', pane: pane.slice(-1500), cwd },
        { status: 504 }
      );
    }

    return NextResponse.json({ success: true, url, tmuxSession: name, cwd });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'unknown error';
    console.error('remote-control POST failed:', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');
  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  }
  const name = tmuxName(sessionId);
  const active = await tmuxHas(name);
  if (!active) return NextResponse.json({ active: false });
  const pane = await tmuxCapture(name);
  return NextResponse.json({ active: true, tmuxSession: name, url: lastUrl(pane) });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');
  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  }
  const name = tmuxName(sessionId);
  const existed = await tmuxHas(name);
  if (existed) await tmuxKill(name);
  return NextResponse.json({ success: true, killed: existed });
}
