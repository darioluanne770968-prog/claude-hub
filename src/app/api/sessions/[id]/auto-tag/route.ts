import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';
import Anthropic from '@anthropic-ai/sdk';

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const PROJECTS_FILE = path.join(CLAUDE_DIR, 'projects.json');

function getSessionPath(sessionId: string): string | null {
  if (!fs.existsSync(PROJECTS_FILE)) return null;

  const projects = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf-8'));

  for (const projectPath of Object.keys(projects)) {
    const hash = Buffer.from(projectPath).toString('base64').replace(/[/+=]/g, '_');
    const sessionDir = path.join(CLAUDE_DIR, 'projects', hash);
    const sessionFile = path.join(sessionDir, `${sessionId}.jsonl`);

    if (fs.existsSync(sessionFile)) {
      return sessionFile;
    }
  }

  return null;
}

async function extractSessionContent(sessionPath: string): Promise<string> {
  const content: string[] = [];
  let charCount = 0;
  const maxChars = 8000; // Limit content to avoid token limits

  const fileStream = fs.createReadStream(sessionPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim() || charCount >= maxChars) continue;

    try {
      const entry = JSON.parse(line);

      if (entry.type === 'user' || entry.type === 'assistant') {
        let text = '';

        if (entry.message?.content) {
          if (Array.isArray(entry.message.content)) {
            for (const block of entry.message.content) {
              if (block.type === 'text') {
                text += block.text + '\n';
              }
            }
          } else if (typeof entry.message.content === 'string') {
            text = entry.message.content;
          }
        }

        if (text) {
          const remaining = maxChars - charCount;
          const toAdd = text.slice(0, remaining);
          content.push(`[${entry.type}]: ${toAdd}`);
          charCount += toAdd.length;
        }
      }
    } catch {
      // Skip invalid lines
    }
  }

  return content.join('\n\n');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    // Check for API key
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY not configured' },
        { status: 500 }
      );
    }

    const sessionPath = getSessionPath(id);
    if (!sessionPath) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Extract content
    const content = await extractSessionContent(sessionPath);
    if (!content) {
      return NextResponse.json({ error: 'No content to analyze' }, { status: 400 });
    }

    // Use Claude to generate tags
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: `Analyze this conversation and suggest 3-5 relevant tags. Return ONLY a JSON array of lowercase tag strings, no other text.

Tags should be:
- Short (1-2 words)
- Descriptive of the main topics
- In the same language as the conversation content
- Examples: "react", "bug-fix", "api-design", "performance", "documentation"

Conversation:
${content}

Return only the JSON array like: ["tag1", "tag2", "tag3"]`,
        },
      ],
    });

    // Parse the response
    const responseText = response.content[0].type === 'text' ? response.content[0].text : '';

    // Extract JSON array from response
    const jsonMatch = responseText.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Failed to parse tags' }, { status: 500 });
    }

    const tags = JSON.parse(jsonMatch[0]) as string[];

    // Validate tags
    const validTags = tags
      .filter((tag): tag is string => typeof tag === 'string')
      .map(tag => tag.toLowerCase().trim().replace(/[^a-z0-9\u4e00-\u9fff-]/g, '-'))
      .filter(tag => tag.length > 0 && tag.length <= 30)
      .slice(0, 5);

    return NextResponse.json({
      success: true,
      tags: validTags,
      message: `Generated ${validTags.length} tags`,
    });
  } catch (error) {
    console.error('Auto-tag error:', error);
    return NextResponse.json(
      { error: 'Failed to generate tags' },
      { status: 500 }
    );
  }
}
