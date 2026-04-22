import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getHostById } from '@/lib/remote-hosts';

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const { sessionId, projectPath, hostId } = await request.json();

    if (!sessionId || !projectPath) {
      return NextResponse.json(
        { error: 'Missing sessionId or projectPath' },
        { status: 400 }
      );
    }

    let terminalCommand: string;

    // Check if this is a remote session
    if (hostId) {
      const host = getHostById(hostId);
      if (!host) {
        return NextResponse.json(
          { error: 'Remote host not found' },
          { status: 404 }
        );
      }

      // Build SSH command to connect to remote host and resume the session
      // Using -t to allocate a pseudo-terminal for interactive session
      const keyPath = host.privateKeyPath.replace('~', process.env.HOME || '');
      const claudeCommand = `cd "${projectPath}" && claude -r ${sessionId}`;
      terminalCommand = `ssh -t -i "${keyPath}" -p ${host.port} ${host.username}@${host.hostname} '${claudeCommand.replace(/'/g, "'\\''")}'`;
    } else {
      // Local session - just run claude directly
      terminalCommand = `cd "${projectPath}" && claude -r ${sessionId}`;
    }

    // AppleScript to open Terminal.app and run the command
    const appleScript = `
      tell application "Terminal"
        activate
        do script "${terminalCommand.replace(/"/g, '\\"')}"
      end tell
    `;

    await execAsync(`osascript -e '${appleScript.replace(/'/g, "'\\''")}'`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to open terminal:', error);
    return NextResponse.json(
      { error: 'Failed to open terminal' },
      { status: 500 }
    );
  }
}
