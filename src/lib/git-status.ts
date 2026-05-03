import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

export interface GitProjectStatus {
  name: string;
  path: string;
  isGitRepo: boolean;
  branch?: string;
  uncommittedCount?: number;
  unpushedCount?: number;
  unpulledCount?: number;
  hasRemote?: boolean;
  remoteUrl?: string;
  hasUpstream?: boolean;
  lastCommit?: {
    hash: string;
    age: string;
    message: string;
  };
  error?: string;
}

async function runGit(repoPath: string, args: string, timeoutMs = 5000): Promise<string> {
  const { stdout } = await execAsync(`git -C "${repoPath}" ${args}`, { timeout: timeoutMs });
  return stdout.trim();
}

async function getProjectStatus(projectPath: string): Promise<GitProjectStatus> {
  const name = path.basename(projectPath);
  const status: GitProjectStatus = { name, path: projectPath, isGitRepo: false };

  if (!fs.existsSync(path.join(projectPath, '.git'))) return status;
  status.isGitRepo = true;

  try {
    status.branch = await runGit(projectPath, 'rev-parse --abbrev-ref HEAD');

    const porcelain = await runGit(projectPath, 'status --porcelain');
    status.uncommittedCount = porcelain ? porcelain.split('\n').filter(Boolean).length : 0;

    try {
      status.remoteUrl = await runGit(projectPath, 'config --get remote.origin.url');
      status.hasRemote = !!status.remoteUrl;
    } catch {
      status.hasRemote = false;
    }

    if (status.hasRemote) {
      try {
        await runGit(projectPath, 'rev-parse --abbrev-ref @{u}');
        status.hasUpstream = true;
        const unpushed = await runGit(projectPath, 'rev-list --count @{u}..HEAD');
        status.unpushedCount = parseInt(unpushed, 10) || 0;
        const unpulled = await runGit(projectPath, 'rev-list --count HEAD..@{u}');
        status.unpulledCount = parseInt(unpulled, 10) || 0;
      } catch {
        status.hasUpstream = false;
      }
    }

    try {
      const last = await runGit(projectPath, "log -1 --format=%H%x09%ar%x09%s");
      const [hash, age, ...msg] = last.split('\t');
      status.lastCommit = { hash: hash.substring(0, 7), age, message: msg.join('\t') };
    } catch { /* no commits yet */ }
  } catch (err) {
    status.error = err instanceof Error ? err.message : String(err);
  }

  return status;
}

export async function scanGitProjects(rootDir: string): Promise<GitProjectStatus[]> {
  if (!fs.existsSync(rootDir)) return [];

  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const projectPaths = entries
    .filter(e => e.isDirectory() && !e.name.startsWith('.'))
    .map(e => path.join(rootDir, e.name));

  const results = await Promise.all(
    projectPaths.map(p => getProjectStatus(p).catch(err => ({
      name: path.basename(p),
      path: p,
      isGitRepo: false,
      error: err instanceof Error ? err.message : String(err),
    } as GitProjectStatus)))
  );

  results.sort((a, b) => {
    const aScore = (a.uncommittedCount || 0) + (a.unpushedCount || 0) * 10;
    const bScore = (b.uncommittedCount || 0) + (b.unpushedCount || 0) * 10;
    if (aScore !== bScore) return bScore - aScore;
    return a.name.localeCompare(b.name);
  });

  return results;
}

export interface GitOpResult {
  success: boolean;
  output: string;
  error?: string;
}

export async function commitAndPush(
  repoPath: string,
  message: string | null,
): Promise<GitOpResult> {
  const logs: string[] = [];
  try {
    if (message) {
      const { stdout: addOut, stderr: addErr } = await execAsync(
        `git -C "${repoPath}" add -A`, { timeout: 30000 },
      );
      logs.push(`$ git add -A\n${addOut}${addErr}`.trim());

      try {
        const { stdout: commitOut, stderr: commitErr } = await execAsync(
          `git -C "${repoPath}" commit -m ${JSON.stringify(message)}`,
          { timeout: 30000 },
        );
        logs.push(`$ git commit -m "${message}"\n${commitOut}${commitErr}`.trim());
      } catch (commitErr) {
        const e = commitErr as { stdout?: string; stderr?: string };
        const out = `${e.stdout || ''}${e.stderr || ''}`;
        if (out.includes('nothing to commit')) {
          logs.push('$ git commit\n(nothing to commit, proceeding to push)');
        } else {
          throw commitErr;
        }
      }
    }

    const { stdout: pushOut, stderr: pushErr } = await execAsync(
      `git -C "${repoPath}" push`, { timeout: 90000 },
    );
    logs.push(`$ git push\n${pushOut}${pushErr}`.trim());

    return { success: true, output: logs.join('\n\n') };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return {
      success: false,
      output: logs.join('\n\n'),
      error: `${e.stdout || ''}${e.stderr || ''}${e.message || String(err)}`.trim(),
    };
  }
}

export async function pullRepo(repoPath: string): Promise<GitOpResult> {
  try {
    const { stdout, stderr } = await execAsync(
      `git -C "${repoPath}" pull --ff-only`, { timeout: 60000 },
    );
    return { success: true, output: `${stdout}${stderr}`.trim() };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return {
      success: false,
      output: '',
      error: `${e.stdout || ''}${e.stderr || ''}${e.message || String(err)}`.trim(),
    };
  }
}
