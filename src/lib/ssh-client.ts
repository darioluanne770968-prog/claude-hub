import { Client, SFTPWrapper } from 'ssh2';
import fs from 'fs';
import path from 'path';
import { RemoteHost } from './remote-hosts';

interface RemoteSession {
  id: string;
  projectPath: string;
  projectName: string;
  summaries: string[];
  customName?: string;
  lastModified: string;
  firstMessage?: string;
  messageCount: number;
  // Additional field to identify the source
  source: {
    type: 'remote';
    hostId: string;
    hostName: string;
  };
}

interface RemoteProject {
  name: string;
  path: string;
  sessions: RemoteSession[];
}

// Execute a command on a remote host and return stdout
async function execRemoteCommand(client: Client, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    client.exec(command, (err, stream) => {
      if (err) {
        reject(err);
        return;
      }

      let stdout = '';
      let stderr = '';

      stream.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      stream.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      stream.on('close', (code: number) => {
        if (code !== 0 && stderr) {
          reject(new Error(`Command failed: ${stderr}`));
        } else {
          resolve(stdout);
        }
      });
    });
  });
}

// Read a file from remote host
async function readRemoteFile(sftp: SFTPWrapper, remotePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    sftp.readFile(remotePath, 'utf8', (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data.toString());
      }
    });
  });
}

// List directory contents on remote host
async function listRemoteDir(sftp: SFTPWrapper, remotePath: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    sftp.readdir(remotePath, (err, list) => {
      if (err) {
        reject(err);
      } else {
        resolve(list.map(item => item.filename));
      }
    });
  });
}

// Check if a path exists on remote host
async function remotePathExists(sftp: SFTPWrapper, remotePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    sftp.stat(remotePath, (err) => {
      resolve(!err);
    });
  });
}

// Get file stats from remote host
async function getRemoteStats(sftp: SFTPWrapper, remotePath: string): Promise<{ mtime: Date } | null> {
  return new Promise((resolve) => {
    sftp.stat(remotePath, (err, stats) => {
      if (err) {
        resolve(null);
      } else {
        resolve({ mtime: new Date(stats.mtime * 1000) });
      }
    });
  });
}

// Connect to a remote host
export function connectToHost(host: RemoteHost): Promise<{ client: Client; sftp: SFTPWrapper }> {
  return new Promise((resolve, reject) => {
    const client = new Client();

    // Read private key
    let privateKey: Buffer;
    try {
      const keyPath = host.privateKeyPath.replace('~', process.env.HOME || '');
      privateKey = fs.readFileSync(keyPath);
    } catch (err) {
      reject(new Error(`Failed to read private key: ${host.privateKeyPath}`));
      return;
    }

    client.on('ready', () => {
      client.sftp((err, sftp) => {
        if (err) {
          client.end();
          reject(err);
        } else {
          resolve({ client, sftp });
        }
      });
    });

    client.on('error', (err) => {
      reject(err);
    });

    client.connect({
      host: host.hostname,
      port: host.port,
      username: host.username,
      privateKey,
      readyTimeout: 10000,
    });
  });
}

// Check if a session should be filtered out (warmup, test sessions, etc.)
function shouldFilterSession(content: string, summaries: string[], firstMessage?: string): boolean {
  // Filter out warmup sessions
  if (summaries.some(s => s.toLowerCase() === 'warmup')) return true;
  if (firstMessage?.toLowerCase() === 'warmup') return true;

  // Filter out empty or very short sessions
  const lines = content.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return true;

  return false;
}

// Parse a session file and extract summary info
function parseSessionSummary(content: string): { summaries: string[]; customName?: string; firstMessage?: string; messageCount: number } {
  try {
    const lines = content.trim().split('\n');
    const summaries: string[] = [];
    let customName: string | undefined;
    let firstMessage: string | undefined;
    let messageCount = 0;

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const entry = JSON.parse(line);

        // Count user and assistant messages
        if (entry.type === 'user' || entry.type === 'assistant') {
          messageCount++;
        }

        // Get first user message as fallback summary
        if (!firstMessage && entry.type === 'user' && entry.message?.content) {
          const content = entry.message.content;
          if (typeof content === 'string') {
            firstMessage = content.slice(0, 100);
          } else if (Array.isArray(content)) {
            const textBlock = content.find((c: { type: string }) => c.type === 'text');
            if (textBlock?.text) {
              firstMessage = textBlock.text.slice(0, 100);
            }
          }
        }

        // Get summary from summary entries
        if (entry.type === 'summary' && entry.summary) {
          summaries.push(entry.summary.slice(0, 200));
        }

        // Get custom name if set
        if (entry.customName) {
          customName = entry.customName;
        }
      } catch {
        // Skip invalid JSON lines
      }
    }

    return { summaries, customName, firstMessage, messageCount };
  } catch {
    return { summaries: [], messageCount: 0 };
  }
}

// Fetch sessions from a remote host
export async function fetchRemoteSessions(host: RemoteHost): Promise<RemoteProject[]> {
  const projects: RemoteProject[] = [];

  let client: Client | null = null;
  let sftp: SFTPWrapper | null = null;

  try {
    const connection = await connectToHost(host);
    client = connection.client;
    sftp = connection.sftp;

    // Get the claude path based on OS
    let claudeBasePath = host.claudePath;
    if (claudeBasePath.startsWith('~')) {
      // Need to resolve ~ on the remote host
      const homeDir = await execRemoteCommand(client, 'echo $HOME');
      claudeBasePath = claudeBasePath.replace('~', homeDir.trim());
    }

    const projectsPath = path.posix.join(claudeBasePath, 'projects');

    // Check if projects directory exists
    if (!(await remotePathExists(sftp, projectsPath))) {
      console.log(`No projects directory found on ${host.name}`);
      return [];
    }

    // List all project directories
    const projectDirs = await listRemoteDir(sftp, projectsPath);

    for (const projectDir of projectDirs) {
      if (projectDir.startsWith('.')) continue;

      const projectPath = path.posix.join(projectsPath, projectDir);
      const sessionsPath = path.posix.join(projectPath, 'sessions');

      // Check if sessions directory exists, otherwise check project directory directly
      const hasSessionsDir = await remotePathExists(sftp, sessionsPath);
      const sessionLookupPath = hasSessionsDir ? sessionsPath : projectPath;

      // Read project_path file to get the actual project path
      let actualProjectPath = '';
      const projectPathFile = path.posix.join(projectPath, 'project_path');
      try {
        actualProjectPath = (await readRemoteFile(sftp, projectPathFile)).trim();
      } catch {
        actualProjectPath = projectDir;
      }

      const projectName = path.basename(actualProjectPath);
      const sessions: RemoteSession[] = [];

      // List all session files (from sessions dir or project dir directly)
      let sessionFiles: string[] = [];
      try {
        sessionFiles = await listRemoteDir(sftp, sessionLookupPath);
      } catch {
        continue; // Skip if can't read directory
      }

      for (const sessionFile of sessionFiles) {
        if (!sessionFile.endsWith('.jsonl')) continue;

        const sessionId = sessionFile.replace('.jsonl', '');
        const sessionFilePath = path.posix.join(sessionLookupPath, sessionFile);

        try {
          // Get file stats for last modified time
          const stats = await getRemoteStats(sftp, sessionFilePath);
          if (!stats) continue;

          // Read session file to get summary info
          const content = await readRemoteFile(sftp, sessionFilePath);
          const { summaries, customName, firstMessage, messageCount } = parseSessionSummary(content);

          // Filter out warmup and empty sessions
          if (shouldFilterSession(content, summaries, firstMessage)) {
            continue;
          }

          sessions.push({
            id: sessionId,
            projectPath: actualProjectPath,
            projectName,
            summaries,
            customName,
            lastModified: stats.mtime.toISOString(),
            firstMessage,
            messageCount,
            source: {
              type: 'remote',
              hostId: host.id,
              hostName: host.name,
            },
          });
        } catch (err) {
          console.error(`Failed to read session ${sessionFile} from ${host.name}:`, err);
        }
      }

      if (sessions.length > 0) {
        // Sort sessions by last modified
        sessions.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());

        projects.push({
          name: projectName,
          path: actualProjectPath,
          sessions,
        });
      }
    }

    // Sort projects by most recent session
    projects.sort((a, b) => {
      const aTime = new Date(a.sessions[0]?.lastModified || 0).getTime();
      const bTime = new Date(b.sessions[0]?.lastModified || 0).getTime();
      return bTime - aTime;
    });

  } catch (err) {
    console.error(`Failed to fetch sessions from ${host.name}:`, err);
    throw err;
  } finally {
    if (client) {
      client.end();
    }
  }

  return projects;
}

// Fetch a single session's content from remote host by project path
export async function fetchRemoteSessionContent(host: RemoteHost, sessionId: string, projectPath: string): Promise<string | null> {
  let client: Client | null = null;
  let sftp: SFTPWrapper | null = null;

  try {
    const connection = await connectToHost(host);
    client = connection.client;
    sftp = connection.sftp;

    let claudeBasePath = host.claudePath;
    if (claudeBasePath.startsWith('~')) {
      const homeDir = await execRemoteCommand(client, 'echo $HOME');
      claudeBasePath = claudeBasePath.replace('~', homeDir.trim());
    }

    const projectsPath = path.posix.join(claudeBasePath, 'projects');

    // List all project directories to find the right one
    const projectDirs = await listRemoteDir(sftp, projectsPath);

    for (const projectDir of projectDirs) {
      const projectDirPath = path.posix.join(projectsPath, projectDir);

      // Check project_path file to match
      let actualPath = projectDir;
      try {
        actualPath = (await readRemoteFile(sftp, path.posix.join(projectDirPath, 'project_path'))).trim();
      } catch {
        // Use directory name as fallback
      }

      // Check if this is the right project
      if (actualPath === projectPath || projectDir === projectPath) {
        // Look for session file in sessions subdir or directly in project dir
        const sessionsPath = path.posix.join(projectDirPath, 'sessions');
        const hasSessionsDir = await remotePathExists(sftp, sessionsPath);

        const sessionFilePath = hasSessionsDir
          ? path.posix.join(sessionsPath, `${sessionId}.jsonl`)
          : path.posix.join(projectDirPath, `${sessionId}.jsonl`);

        if (await remotePathExists(sftp, sessionFilePath)) {
          const content = await readRemoteFile(sftp, sessionFilePath);
          return content;
        }
      }
    }

    return null;

  } catch (err) {
    console.error(`Failed to fetch session content from ${host.name}:`, err);
    return null;
  } finally {
    if (client) {
      client.end();
    }
  }
}

// Fetch a single session's full data from remote host
export async function fetchRemoteSessionDetail(host: RemoteHost, sessionId: string, projectHash: string): Promise<string | null> {
  let client: Client | null = null;
  let sftp: SFTPWrapper | null = null;

  try {
    const connection = await connectToHost(host);
    client = connection.client;
    sftp = connection.sftp;

    let claudeBasePath = host.claudePath;
    if (claudeBasePath.startsWith('~')) {
      const homeDir = await execRemoteCommand(client, 'echo $HOME');
      claudeBasePath = claudeBasePath.replace('~', homeDir.trim());
    }

    const sessionFilePath = path.posix.join(
      claudeBasePath,
      'projects',
      projectHash,
      'sessions',
      `${sessionId}.jsonl`
    );

    const content = await readRemoteFile(sftp, sessionFilePath);
    return content;

  } catch (err) {
    console.error(`Failed to fetch session detail from ${host.name}:`, err);
    return null;
  } finally {
    if (client) {
      client.end();
    }
  }
}
