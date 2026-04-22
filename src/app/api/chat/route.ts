import { spawn } from 'child_process';
import { processManager } from '@/lib/processManager';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max

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
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Build the command arguments
    const cwd = projectPath || process.cwd();
    const args = [
      '--print',
      '--dangerously-skip-permissions',
      '--output-format', 'stream-json',
      '--include-partial-messages',  // Enable real-time streaming
    ];

    if (sessionId) {
      args.push('--resume', sessionId);
    }

    args.push('-p', message);

    console.log('Calling claude with args:', args);
    console.log('Working directory:', cwd);

    // Create a streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const claude = spawn('/opt/homebrew/bin/claude', args, {
          cwd,
          env: process.env,
          stdio: ['inherit', 'pipe', 'pipe'],
        });

        console.log('Claude process spawned with PID:', claude.pid);

        // Register process for tracking
        if (sessionId) {
          processManager.register(sessionId, claude);
        }

        let buffer = '';
        let lastText = '';
        let lastThinking = '';
        let isThinking = false;
        let finalResult = '';

        // Helper to extract thinking content (handles incomplete tags too)
        const extractThinking = (text: string): string | null => {
          // Complete thinking block
          const completeMatch = text.match(/<thinking>([\s\S]*?)<\/thinking>/);
          if (completeMatch) {
            return completeMatch[1].trim();
          }
          // Incomplete thinking block (started but not ended)
          const incompleteMatch = text.match(/<thinking>([\s\S]*?)$/);
          if (incompleteMatch) {
            return incompleteMatch[1].trim();
          }
          return null;
        };

        // Helper to strip thinking tags from text
        const stripThinking = (text: string): string => {
          // Remove complete thinking blocks
          let result = text.replace(/<thinking>[\s\S]*?<\/thinking>/g, '');
          // Remove incomplete thinking blocks (from <thinking> to end)
          result = result.replace(/<thinking>[\s\S]*$/g, '');
          return result.trim();
        };

        // Helper to check if currently in thinking mode
        const hasOpenThinking = (text: string): boolean => {
          const openCount = (text.match(/<thinking>/g) || []).length;
          const closeCount = (text.match(/<\/thinking>/g) || []).length;
          return openCount > closeCount;
        };

        claude.stdout.on('data', (data) => {
          buffer += data.toString();

          // Process complete JSON lines
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (!line.trim()) continue;

            try {
              const json = JSON.parse(line);

              // Handle different message types
              if (json.type === 'assistant' && json.message?.content) {
                // Extract text from assistant message (partial or complete)
                let fullText = '';
                for (const content of json.message.content) {
                  if (content.type === 'text' && content.text) {
                    fullText += content.text;
                  }
                }

                // Check if we're in thinking mode
                const currentlyThinking = hasOpenThinking(fullText);
                if (currentlyThinking && !isThinking) {
                  isThinking = true;
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'status', text: '正在思考中' })}\n\n`));
                }

                // Extract and send thinking content separately
                const thinking = extractThinking(fullText);
                if (thinking && thinking !== lastThinking) {
                  lastThinking = thinking;
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'thinking', text: thinking })}\n\n`));
                }

                // Strip thinking tags and send main content
                const cleanText = stripThinking(fullText);
                if (cleanText && cleanText !== lastText) {
                  lastText = cleanText;
                  isThinking = false; // We have actual content now
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'content', text: cleanText })}\n\n`));
                }
              } else if (json.type === 'system' && json.subtype === 'init') {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'status', text: '已连接，正在处理' })}\n\n`));
              }
            } catch (e) {
              // Not valid JSON, skip
            }
          }
        });

        claude.stderr.on('data', (data) => {
          const text = data.toString();
          console.log('Claude stderr:', text);
        });

        claude.on('close', (code) => {
          console.log('Claude exited with code:', code);

          // Unregister process
          if (sessionId) {
            processManager.unregister(sessionId);
          }

          // Process any remaining buffer
          if (buffer.trim()) {
            try {
              const json = JSON.parse(buffer);
              if (json.type === 'result') {
                finalResult = json.result || '';
              }
            } catch (e) {
              // Ignore
            }
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
          controller.close();
        });

        claude.on('error', (error) => {
          console.error('Claude process error:', error);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'error',
            text: 'Claude CLI 错误: ' + error.message
          })}\n\n`));
          controller.close();
        });

        // Set timeout
        const timeout = setTimeout(() => {
          claude.kill();
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'error',
            text: '请求超时（3分钟）'
          })}\n\n`));
          controller.close();
        }, 180000);

        claude.on('close', () => clearTimeout(timeout));
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Chat error:', error);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'error',
          text: '请求失败: ' + (error instanceof Error ? error.message : String(error))
        })}\n\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  }
}
