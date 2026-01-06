import { NextResponse } from 'next/server';
import { spawn } from 'child_process';

export const dynamic = 'force-dynamic';

interface ChatRequest {
  message: string;
  sessionId?: string;
  projectPath?: string;
}

export async function POST(request: Request) {
  try {
    const body: ChatRequest = await request.json();
    const { message, sessionId, projectPath } = body;

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // Try to call Claude Code CLI
    // This uses the --print flag for non-interactive output
    const response = await callClaudeCode(message, projectPath, sessionId);

    return NextResponse.json({ response });
  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json(
      { error: 'Failed to process chat request' },
      { status: 500 }
    );
  }
}

async function callClaudeCode(
  message: string,
  projectPath?: string,
  sessionId?: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    // Build the command arguments
    const args = ['--print'];

    // If we have a session ID, try to resume it
    if (sessionId) {
      args.push('--resume', sessionId);
    }

    // Add the message
    args.push(message);

    // Spawn the claude process
    const cwd = projectPath || process.cwd();
    const claude = spawn('claude', args, {
      cwd,
      env: { ...process.env },
      shell: true,
    });

    let stdout = '';
    let stderr = '';

    claude.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    claude.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    claude.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim() || 'Response received');
      } else {
        console.error('Claude CLI error:', stderr);
        // Return a fallback message if Claude CLI fails
        resolve(
          'Unable to connect to Claude Code CLI. Please ensure Claude Code is installed and you are logged in.'
        );
      }
    });

    claude.on('error', (error) => {
      console.error('Failed to spawn Claude CLI:', error);
      resolve(
        'Claude Code CLI is not available. Please install it and try again.'
      );
    });

    // Set a timeout
    setTimeout(() => {
      claude.kill();
      resolve('Request timed out. Please try again.');
    }, 60000); // 60 second timeout
  });
}
