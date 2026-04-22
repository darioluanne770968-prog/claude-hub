import { NextRequest, NextResponse } from 'next/server';
import { getHostById } from '@/lib/remote-hosts';
import { connectToHost } from '@/lib/ssh-client';
import { Client, SFTPWrapper } from 'ssh2';
import fs from 'fs';
import path from 'path';
import os from 'os';

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

// Check if a path exists on remote host
async function remotePathExists(sftp: SFTPWrapper, remotePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    sftp.stat(remotePath, (err) => {
      resolve(!err);
    });
  });
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

// Convert project path to Claude's directory name format
// e.g., /Users/hui/ClaudeProjects/passworddem -> -Users-hui-ClaudeProjects-passworddem
function pathToClaudeDir(projectPath: string): string {
  return projectPath.replace(/\//g, '-');
}

export async function POST(request: NextRequest) {
  let client: Client | null = null;

  try {
    const { sessionId, projectPath, hostId } = await request.json();

    if (!sessionId || !projectPath || !hostId) {
      return NextResponse.json(
        { error: 'Missing sessionId, projectPath, or hostId' },
        { status: 400 }
      );
    }

    // Get the remote host configuration
    const host = getHostById(hostId);
    if (!host) {
      return NextResponse.json(
        { error: 'Remote host not found' },
        { status: 404 }
      );
    }

    // Connect to the remote host
    const connection = await connectToHost(host);
    client = connection.client;
    const sftp = connection.sftp;

    // Resolve claude path on remote host
    let claudeBasePath = host.claudePath;
    if (claudeBasePath.startsWith('~')) {
      const homeDir = await execRemoteCommand(client, 'echo $HOME');
      claudeBasePath = claudeBasePath.replace('~', homeDir.trim());
    }

    const projectsPath = path.posix.join(claudeBasePath, 'projects');

    // Find the remote session file
    let remoteSessionContent: string | null = null;
    let remoteProjectHash: string | null = null;

    // List all project directories to find the right one
    const readdir = (dirPath: string): Promise<string[]> => {
      return new Promise((resolve, reject) => {
        sftp.readdir(dirPath, (err, list) => {
          if (err) reject(err);
          else resolve(list.map(item => item.filename));
        });
      });
    };

    const projectDirs = await readdir(projectsPath);

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
        remoteProjectHash = projectDir;

        // Look for session file in sessions subdir or directly in project dir
        const sessionsPath = path.posix.join(projectDirPath, 'sessions');
        const hasSessionsDir = await remotePathExists(sftp, sessionsPath);

        const sessionFilePath = hasSessionsDir
          ? path.posix.join(sessionsPath, `${sessionId}.jsonl`)
          : path.posix.join(projectDirPath, `${sessionId}.jsonl`);

        if (await remotePathExists(sftp, sessionFilePath)) {
          remoteSessionContent = await readRemoteFile(sftp, sessionFilePath);
          break;
        }
      }
    }

    if (!remoteSessionContent) {
      return NextResponse.json(
        { error: 'Session file not found on remote host' },
        { status: 404 }
      );
    }

    // Now create the local project directory and save the session
    // Use local user's home directory for the project path
    const localHome = os.homedir();
    const localUsername = path.basename(localHome);

    // Convert remote path to local path (replace remote username with local username)
    // e.g., /Users/haihui/ClaudeProjects/project -> /Users/hui/ClaudeProjects/project
    const pathParts = projectPath.split('/');
    if (pathParts.length >= 3 && pathParts[1] === 'Users') {
      pathParts[2] = localUsername;
    }
    const localProjectPath = pathParts.join('/');

    // Claude CLI uses dash-separated path format for project directories
    // e.g., /Users/hui/ClaudeProjects/passworddem -> -Users-hui-ClaudeProjects-passworddem
    const localClaudePath = path.join(localHome, '.claude');
    const localProjectsPath = path.join(localClaudePath, 'projects');
    const claudeProjectDirName = pathToClaudeDir(localProjectPath);
    const localProjectDir = path.join(localProjectsPath, claudeProjectDirName);

    // Create project directory if it doesn't exist
    if (!fs.existsSync(localProjectDir)) {
      fs.mkdirSync(localProjectDir, { recursive: true });
    }

    // Write the session file directly in the project directory (not in a sessions subdirectory)
    // This matches Claude CLI's storage format
    const localSessionFile = path.join(localProjectDir, `${sessionId}.jsonl`);
    fs.writeFileSync(localSessionFile, remoteSessionContent, 'utf8');

    return NextResponse.json({
      success: true,
      localPath: localSessionFile,
      localProjectPath,
      message: '会话已复制到本地，现在可以在本地继续该会话',
    });

  } catch (error) {
    console.error('Failed to copy session to local:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to copy session to local' },
      { status: 500 }
    );
  } finally {
    if (client) {
      client.end();
    }
  }
}
