import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { redactText } from '@/lib/redaction';

interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
}

function formatToolUse(name: string, input: Record<string, unknown>): string {
  const toolLabels: Record<string, string> = {
    Read: '读取文件',
    Write: '写入文件',
    Edit: '编辑文件',
    Bash: '执行命令',
    Grep: '搜索内容',
    Glob: '查找文件',
  };

  let result = `**🔧 ${toolLabels[name] || name}**\n`;

  if (name === 'Bash' && input.command) {
    result += `\`\`\`bash\n${input.command}\n\`\`\`\n`;
  } else if (name === 'Read' && input.file_path) {
    result += `📄 \`${input.file_path}\`\n`;
  } else if (name === 'Write' && input.file_path) {
    result += `📝 \`${input.file_path}\`\n`;
  } else if (name === 'Edit' && input.file_path) {
    result += `✏️ \`${input.file_path}\`\n`;
  } else if (name === 'Grep' && input.pattern) {
    result += `🔍 搜索: \`${input.pattern}\`\n`;
  }

  return result;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format') || 'markdown';
  const shouldRedact = searchParams.get('redact') === 'true';

  const claudePath = path.join(os.homedir(), '.claude', 'projects');

  // Helper to optionally redact text
  const processText = (text: string) => shouldRedact ? redactText(text) : text;

  try {
    // Find the session file
    let sessionContent: string | null = null;
    let projectName = '';

    const projectDirs = fs.readdirSync(claudePath);

    for (const projectDir of projectDirs) {
      if (projectDir.startsWith('.')) continue;

      const projectPath = path.join(claudePath, projectDir);
      const stat = fs.statSync(projectPath);
      if (!stat.isDirectory()) continue;

      const sessionFile = path.join(projectPath, `${id}.jsonl`);
      if (fs.existsSync(sessionFile)) {
        sessionContent = fs.readFileSync(sessionFile, 'utf8');
        projectName = projectDir.split('-').pop() || projectDir;
        break;
      }
    }

    if (!sessionContent) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Parse and convert to markdown
    const lines = sessionContent.trim().split('\n');
    let markdown = `# Claude Code 会话记录\n\n`;
    markdown += `**项目**: ${projectName}\n`;
    markdown += `**会话 ID**: ${id}\n`;
    markdown += `**导出时间**: ${new Date().toLocaleString('zh-CN')}\n\n`;
    markdown += `---\n\n`;

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const entry = JSON.parse(line);

        if (entry.type === 'user' && entry.message?.content) {
          const content = typeof entry.message.content === 'string'
            ? entry.message.content
            : entry.message.content.map((c: ContentBlock) => c.text || '').join('\n');

          markdown += `## 👤 用户\n\n`;
          if (entry.timestamp) {
            markdown += `*${new Date(entry.timestamp).toLocaleString('zh-CN')}*\n\n`;
          }
          markdown += `${processText(content)}\n\n`;
        }

        if (entry.type === 'assistant' && entry.message?.content) {
          markdown += `## 🤖 Claude\n\n`;
          if (entry.timestamp) {
            markdown += `*${new Date(entry.timestamp).toLocaleString('zh-CN')}*\n\n`;
          }

          const contentBlocks = Array.isArray(entry.message.content)
            ? entry.message.content
            : [{ type: 'text', text: entry.message.content }];

          for (const block of contentBlocks) {
            if (block.type === 'text' && block.text) {
              markdown += `${processText(block.text)}\n\n`;
            } else if (block.type === 'tool_use' && block.name) {
              markdown += formatToolUse(block.name, block.input || {});
              markdown += '\n';
            }
          }
        }

        if (entry.type === 'tool-result') {
          // Skip tool results in export for cleaner output
        }

        if (entry.type === 'summary' && entry.summary) {
          markdown += `---\n\n`;
          markdown += `**📋 会话摘要**: ${entry.summary}\n\n`;
        }

      } catch {
        // Skip invalid JSON
      }
    }

    markdown += `---\n\n`;
    markdown += `*导出自 Claude Hub*\n`;

    // Return as downloadable file
    const filename = `claude-session-${id.slice(0, 8)}-${new Date().toISOString().split('T')[0]}.md`;

    return new NextResponse(markdown, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });

  } catch (error) {
    console.error('Export failed:', error);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}
