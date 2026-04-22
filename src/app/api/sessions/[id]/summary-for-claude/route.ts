import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import Anthropic from '@anthropic-ai/sdk';

interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

// Initialize Anthropic client
const getAnthropicClient = () => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new Anthropic({ apiKey });
};

/**
 * Generate a summary of the session that can be pasted into VS Code Claude
 * to continue the conversation with full context.
 * Uses Claude Haiku for intelligent summarization.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const useAI = searchParams.get('ai') !== 'false'; // Default to using AI

  const claudePath = path.join(os.homedir(), '.claude', 'projects');

  try {
    // Find the session file
    let sessionContent: string | null = null;
    let projectName = '';
    let projectDir = '';

    const projectDirs = fs.readdirSync(claudePath);

    for (const dir of projectDirs) {
      if (dir.startsWith('.')) continue;

      const dirPath = path.join(claudePath, dir);
      const stat = fs.statSync(dirPath);
      if (!stat.isDirectory()) continue;

      const sessionFile = path.join(dirPath, `${id}.jsonl`);
      if (fs.existsSync(sessionFile)) {
        sessionContent = fs.readFileSync(sessionFile, 'utf8');
        projectDir = dir;
        projectName = dir.split('-').pop() || dir;
        break;
      }
    }

    if (!sessionContent) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Parse session and extract key information
    const lines = sessionContent.trim().split('\n');

    // Collect data
    const userMessages: { text: string; timestamp?: string }[] = [];
    const assistantResponses: string[] = [];
    const toolsUsed: Set<string> = new Set();
    const filesModified: Set<string> = new Set();
    const filesRead: Set<string> = new Set();
    const commandsRun: string[] = [];
    let lastTodos: TodoItem[] = [];
    let sessionSummary = '';

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const entry = JSON.parse(line);

        // User messages
        if (entry.type === 'user' && entry.message?.content) {
          const content = typeof entry.message.content === 'string'
            ? entry.message.content
            : entry.message.content
                .filter((c: ContentBlock) => c.type === 'text')
                .map((c: ContentBlock) => c.text || '')
                .join('\n');

          if (content.trim()) {
            userMessages.push({
              text: content.trim(),
              timestamp: entry.timestamp
            });
          }
        }

        // Assistant messages
        if (entry.type === 'assistant' && entry.message?.content) {
          const contentBlocks = Array.isArray(entry.message.content)
            ? entry.message.content
            : [{ type: 'text', text: entry.message.content }];

          for (const block of contentBlocks) {
            if (block.type === 'text' && block.text) {
              // Only keep substantial responses (not just short acknowledgments)
              if (block.text.length > 100) {
                assistantResponses.push(block.text);
              }
            } else if (block.type === 'tool_use' && block.name) {
              toolsUsed.add(block.name);

              const input = block.input || {};

              if (block.name === 'Write' && input.file_path) {
                filesModified.add(input.file_path as string);
              } else if (block.name === 'Edit' && input.file_path) {
                filesModified.add(input.file_path as string);
              } else if (block.name === 'Read' && input.file_path) {
                filesRead.add(input.file_path as string);
              } else if (block.name === 'Bash' && input.command) {
                const cmd = input.command as string;
                // Only include significant commands
                if (cmd.length < 200 && !cmd.startsWith('cat ') && !cmd.startsWith('echo ')) {
                  commandsRun.push(cmd);
                }
              } else if (block.name === 'TodoWrite' && input.todos) {
                lastTodos = input.todos as TodoItem[];
              }
            }
          }
        }

        // Session summary from Claude Code
        if (entry.type === 'summary' && entry.summary) {
          sessionSummary = entry.summary;
        }

      } catch {
        // Skip invalid JSON
      }
    }

    // Build context for AI summarization
    let contextForAI = `# 会话信息
项目: ${projectName}
会话ID: ${id}
消息数量: ${userMessages.length} 条用户消息

`;

    // Add session summary if available
    if (sessionSummary) {
      contextForAI += `## 系统生成的摘要\n${sessionSummary}\n\n`;
    }

    // Add user messages (limit to last 20 for token efficiency)
    contextForAI += `## 用户请求历史\n`;
    const recentUserMessages = userMessages.slice(-20);
    recentUserMessages.forEach((msg, i) => {
      const truncated = msg.text.length > 500 ? msg.text.slice(0, 500) + '...' : msg.text;
      contextForAI += `${i + 1}. ${truncated}\n`;
    });

    // Add files info
    if (filesModified.size > 0) {
      contextForAI += `\n## 修改的文件 (${filesModified.size} 个)\n`;
      Array.from(filesModified).slice(-30).forEach(file => {
        contextForAI += `- ${file}\n`;
      });
    }

    if (filesRead.size > 0) {
      contextForAI += `\n## 读取的文件 (${filesRead.size} 个，显示部分)\n`;
      Array.from(filesRead).slice(-15).forEach(file => {
        contextForAI += `- ${file}\n`;
      });
    }

    // Add commands
    if (commandsRun.length > 0) {
      contextForAI += `\n## 执行的命令 (${commandsRun.length} 个，显示部分)\n`;
      commandsRun.slice(-10).forEach(cmd => {
        contextForAI += `- ${cmd}\n`;
      });
    }

    // Add todo list
    if (lastTodos.length > 0) {
      contextForAI += `\n## 最后的任务列表\n`;
      lastTodos.forEach(todo => {
        const status = todo.status === 'completed' ? '✅' :
                       todo.status === 'in_progress' ? '🔄' : '⬜';
        contextForAI += `${status} ${todo.content}\n`;
      });
    }

    // Add last assistant response (truncated)
    if (assistantResponses.length > 0) {
      const lastResponse = assistantResponses[assistantResponses.length - 1];
      const truncated = lastResponse.length > 1500
        ? lastResponse.slice(0, 1500) + '...'
        : lastResponse;
      contextForAI += `\n## 最后的 Claude 回复\n${truncated}\n`;
    }

    // Try to use AI for summarization
    let summary = '';
    let usedAI = false;

    const anthropic = getAnthropicClient();

    if (useAI && anthropic) {
      try {
        const response = await anthropic.messages.create({
          model: 'claude-3-haiku-20240307',
          max_tokens: 2000,
          messages: [
            {
              role: 'user',
              content: `你是一个会话摘要助手。请根据以下 Claude Code 会话记录，生成一个简洁但全面的摘要。

这个摘要将被粘贴到另一个 Claude 实例中，让它能够理解之前的工作上下文并继续执行任务。

请按以下格式输出摘要：

1. **项目概述** (1-2句话描述这个项目是什么)
2. **已完成的工作** (列出主要完成的任务，按重要性排序)
3. **当前状态** (描述项目/任务的当前状态)
4. **关键文件** (列出最重要的几个被修改的文件及其作用)
5. **待处理事项** (如果有未完成的任务)

保持摘要简洁，控制在 800 字以内。使用中文。

---

${contextForAI}`
            }
          ]
        });

        const textBlock = response.content.find(block => block.type === 'text');
        if (textBlock && textBlock.type === 'text') {
          summary = `# 会话上下文摘要 (AI 生成)

> 这是由 Claude Haiku 根据会话记录生成的智能摘要。可以直接粘贴到 VS Code Claude 继续工作。

**项目**: ${projectName}
**会话 ID**: ${id}
**消息数量**: ${userMessages.length} 条

---

${textBlock.text}

---

*请告诉我接下来需要做什么？*
`;
          usedAI = true;
        }
      } catch (aiError) {
        console.error('AI summarization failed:', aiError);
        // Fall back to basic summary
      }
    }

    // Fallback to basic summary if AI failed or disabled
    if (!summary) {
      summary = `# 会话上下文摘要

> 这是从 Claude Code 会话导出的上下文摘要。请基于以下信息理解之前的工作内容。

**项目**: ${projectName}
**会话 ID**: ${id}
**消息数量**: ${userMessages.length} 条

`;

      if (sessionSummary) {
        summary += `## 会话摘要\n${sessionSummary}\n\n`;
      }

      if (userMessages.length > 0) {
        summary += `## 用户请求历史\n`;
        const recent = userMessages.slice(-5);
        recent.forEach((msg, i) => {
          const truncated = msg.text.length > 300 ? msg.text.slice(0, 300) + '...' : msg.text;
          summary += `${i + 1}. ${truncated}\n`;
        });
        summary += '\n';
      }

      if (filesModified.size > 0) {
        summary += `## 修改的文件\n`;
        Array.from(filesModified).slice(-15).forEach(file => {
          summary += `- \`${file}\`\n`;
        });
        summary += '\n';
      }

      if (lastTodos.length > 0) {
        summary += `## 任务列表状态\n`;
        lastTodos.forEach(todo => {
          const status = todo.status === 'completed' ? '✅' :
                         todo.status === 'in_progress' ? '🔄' : '⬜';
          summary += `${status} ${todo.content}\n`;
        });
        summary += '\n';
      }

      summary += `---\n\n*请告诉我接下来需要做什么？*\n`;
    }

    return NextResponse.json({
      summary,
      projectName,
      sessionId: id,
      usedAI,
      stats: {
        userMessages: userMessages.length,
        assistantResponses: assistantResponses.length,
        filesModified: filesModified.size,
        filesRead: filesRead.size,
        toolsUsed: Array.from(toolsUsed),
        commandsRun: commandsRun.length,
      }
    });

  } catch (error) {
    console.error('Summary generation failed:', error);
    return NextResponse.json({ error: 'Summary generation failed' }, { status: 500 });
  }
}
