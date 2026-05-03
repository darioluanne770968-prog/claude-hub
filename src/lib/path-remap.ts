import os from 'os';
import path from 'path';
import fs from 'fs';

export interface PathRemapResult {
  /** Path to use in `cd` on this machine. */
  path: string;
  /** Original path as stored in the session metadata. */
  originalPath: string;
  /** True if the path was rewritten to the current user's home. */
  remapped: boolean;
}

/**
 * Rewrite paths that live under another macOS user's home directory.
 *
 * When a session is synced from another Mac whose username differs from this
 * machine's, the recorded cwd (e.g. `/Users/hui/foo`) does not exist locally.
 * Rewrite it to the current user's home (`/Users/haihui/foo`) so `cd` succeeds
 * and `claude --resume` can run.
 */
export function remapProjectPath(projectPath: string): PathRemapResult {
  const m = projectPath.match(/^\/Users\/([^/]+)(\/.*)?$/);
  if (!m) return { path: projectPath, originalPath: projectPath, remapped: false };

  const otherUser = m[1];
  const suffix = m[2] || '';
  const currentUser = path.basename(os.homedir());
  if (otherUser === currentUser) {
    return { path: projectPath, originalPath: projectPath, remapped: false };
  }

  return {
    path: path.join(os.homedir(), suffix),
    originalPath: projectPath,
    remapped: true,
  };
}

/**
 * `claude --resume <id>` looks for the JSONL at:
 *   ~/.claude/projects/<cwd-with-slashes-as-dashes>/<id>.jsonl
 *
 * After we remap the cwd, the encoded directory changes too. The synced JSONL
 * still lives under the original encoded directory, so symlink it into the
 * remapped one so the resume succeeds.
 *
 * Returns true if the link is in place (created or already correct), false if
 * the source JSONL is missing or the link could not be created.
 */
export function ensureSessionFileLink(
  sessionId: string,
  originalPath: string,
  remappedPath: string,
): boolean {
  if (originalPath === remappedPath) return true;

  const projectsDir = path.join(os.homedir(), '.claude', 'projects');
  const encode = (p: string) => p.replace(/\//g, '-');

  const srcFile = path.join(projectsDir, encode(originalPath), `${sessionId}.jsonl`);
  const dstDir = path.join(projectsDir, encode(remappedPath));
  const dstFile = path.join(dstDir, `${sessionId}.jsonl`);

  if (!fs.existsSync(srcFile)) return false;

  fs.mkdirSync(dstDir, { recursive: true });

  let dstStat: fs.Stats | undefined;
  try { dstStat = fs.lstatSync(dstFile); } catch { /* no entry */ }

  if (dstStat) {
    if (dstStat.isSymbolicLink()) {
      const target = fs.readlinkSync(dstFile);
      const resolved = path.isAbsolute(target) ? target : path.resolve(dstDir, target);
      if (resolved === srcFile) return true;
      fs.unlinkSync(dstFile);
    } else {
      // A real file already exists at the destination (user resumed natively
      // before we ever ran). Leave it alone — that JSONL is the truth here.
      return true;
    }
  }

  try {
    fs.symlinkSync(srcFile, dstFile);
    return true;
  } catch (err) {
    console.error('Failed to create session file symlink:', err);
    return false;
  }
}
