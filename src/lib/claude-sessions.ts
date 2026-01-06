import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');

export interface Message {
  role: 'user' | 'assistant';
  content: string | MessageContent[];
}

export interface ImageSource {
  type: 'base64' | 'url';
  media_type?: string;
  data?: string;
  url?: string;
}

export interface MessageContent {
  type: 'text' | 'image' | 'thinking' | 'tool_use' | 'tool_result';
  text?: string;
  thinking?: string;
  // image fields
  source?: ImageSource;
  // tool_use fields
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  // tool_result fields
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
}

// Question option for AskUserQuestion
export interface QuestionOption {
  label: string;
  description?: string;
}

// Question for AskUserQuestion
export interface Question {
  question: string;
  header?: string;
  options: QuestionOption[];
}

// Extracted content item for display
export interface ExtractedContent {
  type: 'text' | 'image' | 'tool' | 'thinking' | 'command' | 'command-result' | 'user-answer' | 'context-summary';
  text?: string;
  imageData?: string; // data URL for images
  toolName?: string;
  toolDescription?: string; // What the tool is doing
  toolCommand?: string; // For Bash commands
  toolFilePath?: string; // For file operations
  thinking?: string; // Claude's thinking process
  commandName?: string; // For slash commands like /rename
  commandArgs?: string; // Command arguments
  commandResult?: string; // Command output
  isError?: boolean; // For error output
  questions?: Question[]; // For AskUserQuestion
  userAnswers?: Record<string, string>; // User's answers to questions
  summaryText?: string; // For context summary
}

export interface SessionEntry {
  type: string;
  uuid?: string;
  parentUuid?: string;
  timestamp?: string;
  message?: Message;
  summary?: string;
  sessionId?: string;
  cwd?: string;
}

export interface Session {
  id: string;
  projectPath: string;
  projectName: string;
  summaries: string[];
  messages: SessionEntry[];
  lastModified: Date;
  firstMessage?: string;
  customName?: string; // User-defined name from /rename command
}

export interface Project {
  path: string;
  name: string;
  sessions: Session[];
}

// Decode project directory name to actual path
function decodeProjectPath(encodedName: string): string {
  return encodedName.replace(/-/g, '/');
}

// Check if message content is a tool result
export function isToolResultMessage(message: Message | undefined): boolean {
  if (!message) return false;
  if (Array.isArray(message.content)) {
    return message.content.some(item => item.type === 'tool_result');
  }
  return false;
}

// Parse XML-like tags from text
function parseXmlTag(text: string, tagName: string): string | null {
  const regex = new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, 'i');
  const match = text.match(regex);
  return match ? match[1].trim() : null;
}

// Check if text contains a slash command
function isSlashCommand(text: string): boolean {
  return text.includes('<command-name>') || text.includes('<local-command-stdout>');
}

// Parse slash command from text
function parseSlashCommand(text: string): ExtractedContent | null {
  const commandName = parseXmlTag(text, 'command-name');
  const commandArgs = parseXmlTag(text, 'command-args');

  if (commandName) {
    return {
      type: 'command',
      commandName,
      commandArgs: commandArgs || undefined,
    };
  }
  return null;
}

// Parse command result from text
function parseCommandResult(text: string): ExtractedContent | null {
  const stdout = parseXmlTag(text, 'local-command-stdout');
  const stderr = parseXmlTag(text, 'local-command-stderr');

  if (stdout) {
    return {
      type: 'command-result',
      commandResult: stdout,
      isError: false,
    };
  }
  if (stderr) {
    return {
      type: 'command-result',
      commandResult: stderr,
      isError: true,
    };
  }
  return null;
}

// Check if text is a system notification that should be hidden
function isHiddenSystemMessage(text: string): boolean {
  return text.includes('<system-reminder>') ||
         text.includes('Caveat: The messages below were generated');
}

// Check if text is a context summary (conversation continuation summary)
function isContextSummary(text: string): boolean {
  return text.includes('This session is being continued from a previous conversation') ||
         (text.includes('conversation is summarized below') && text.includes('Analysis:')) ||
         (text.includes('Summary:') && text.includes('Primary Request') && text.includes('Key Technical Concepts'));
}

// Extract custom session name from /rename command result
function extractCustomName(entries: SessionEntry[]): string | undefined {
  // Look for the most recent /rename command result
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type === 'user' && entry.message) {
      const content = entry.message.content;
      const textContent = typeof content === 'string' ? content :
        Array.isArray(content) ? content.find(c => c.type === 'text')?.text : undefined;

      if (textContent) {
        // Check for rename command result: <local-command-stdout>Session renamed to: xxx</local-command-stdout>
        const match = textContent.match(/<local-command-stdout>Session renamed to:\s*(.+?)<\/local-command-stdout>/);
        if (match && match[1]) {
          return match[1].trim();
        }
      }
    }
  }
  return undefined;
}

// Extract text from message content for assistant messages
export function extractTextFromAssistantMessage(message: Message | undefined): string {
  if (!message) return '';

  if (typeof message.content === 'string') {
    return message.content;
  }

  if (Array.isArray(message.content)) {
    const parts: string[] = [];

    for (const item of message.content) {
      if (item.type === 'text' && item.text) {
        parts.push(item.text);
      } else if (item.type === 'tool_use' && item.name) {
        parts.push(`[Tool: ${item.name}]`);
      }
      // Skip thinking blocks
    }

    return parts.join('\n');
  }

  return '';
}

// Extract text from message content for user messages
export function extractTextFromUserMessage(message: Message | undefined): string {
  if (!message) return '';

  if (typeof message.content === 'string') {
    // Filter out system messages
    if (isSystemMessage(message)) return '';
    return message.content;
  }

  if (Array.isArray(message.content)) {
    const parts: string[] = [];

    for (const item of message.content) {
      if (item.type === 'text' && item.text) {
        // Filter out system notification text
        if (!item.text.includes('<bash-notification>') &&
            !item.text.includes('<system-reminder>') &&
            !item.text.includes('<command-name>') &&
            !item.text.includes('<local-command-stdout>') &&
            !item.text.includes('<local-command-stderr>') &&
            !item.text.includes('Caveat: The messages below were generated')) {
          parts.push(item.text);
        }
      } else if (item.type === 'image') {
        parts.push('[Image]');
      }
      // Skip tool_result - these are not real user messages
    }

    return parts.join('\n');
  }

  return '';
}

// Extract rich content (including images) from user messages - show everything
export function extractRichContentFromUserMessage(message: Message | undefined): ExtractedContent[] {
  if (!message) return [];

  const contents: ExtractedContent[] = [];

  if (typeof message.content === 'string') {
    const text = message.content.trim();
    if (!text) return contents;

    // Skip only truly hidden system messages
    if (isHiddenSystemMessage(text)) return contents;

    // Check for context summary (conversation continuation)
    if (isContextSummary(text)) {
      contents.push({
        type: 'context-summary',
        summaryText: text,
      });
      return contents;
    }

    // Parse slash commands
    const command = parseSlashCommand(text);
    if (command) {
      contents.push(command);
      return contents;
    }

    // Parse command results
    const result = parseCommandResult(text);
    if (result) {
      contents.push(result);
      return contents;
    }

    // Parse bash notifications nicely
    if (text.includes('<bash-notification>')) {
      const shellId = parseXmlTag(text, 'shell-id');
      const status = parseXmlTag(text, 'status');
      const summary = parseXmlTag(text, 'summary');
      contents.push({
        type: 'command-result',
        commandResult: summary || `Shell ${shellId}: ${status}`,
        isError: status === 'failed',
      });
      return contents;
    }

    contents.push({ type: 'text', text });
    return contents;
  }

  if (Array.isArray(message.content)) {
    for (const item of message.content) {
      if (item.type === 'text' && item.text) {
        const text = item.text.trim();
        if (!text || isHiddenSystemMessage(text)) continue;

        // Check for context summary
        if (isContextSummary(text)) {
          contents.push({
            type: 'context-summary',
            summaryText: text,
          });
          continue;
        }

        // Parse slash commands
        const command = parseSlashCommand(text);
        if (command) {
          contents.push(command);
          continue;
        }

        // Parse command results
        const result = parseCommandResult(text);
        if (result) {
          contents.push(result);
          continue;
        }

        // Parse bash notifications
        if (text.includes('<bash-notification>')) {
          const shellId = parseXmlTag(text, 'shell-id');
          const status = parseXmlTag(text, 'status');
          const summary = parseXmlTag(text, 'summary');
          contents.push({
            type: 'command-result',
            commandResult: summary || `Shell ${shellId}: ${status}`,
            isError: status === 'failed',
          });
          continue;
        }

        contents.push({ type: 'text', text });
      } else if (item.type === 'image' && item.source) {
        if (item.source.type === 'base64' && item.source.data && item.source.media_type) {
          contents.push({
            type: 'image',
            imageData: `data:${item.source.media_type};base64,${item.source.data}`
          });
        }
      } else if (item.type === 'tool_result') {
        // Show tool results
        const resultContent = typeof item.content === 'string' ? item.content : '';
        if (resultContent.trim()) {
          // Check if this is an AskUserQuestion answer
          if (resultContent.startsWith('User has answered your questions:')) {
            // Parse the answers: "question"="answer" format
            const answersText = resultContent.replace('User has answered your questions:', '').trim();
            // Remove the trailing ". You can now continue with the user's answers in mind."
            const cleanAnswers = answersText.replace(/\.\s*You can now continue.*$/, '').trim();

            // Parse "question"="answer" pairs
            const answerPairs: Record<string, string> = {};
            const regex = /"([^"]+)"\s*=\s*"([^"]+)"/g;
            let match;
            while ((match = regex.exec(cleanAnswers)) !== null) {
              answerPairs[match[1]] = match[2];
            }

            contents.push({
              type: 'user-answer',
              userAnswers: answerPairs,
            });
          } else {
            contents.push({
              type: 'command-result',
              commandResult: resultContent.length > 500
                ? resultContent.substring(0, 500) + '...'
                : resultContent,
              isError: item.is_error,
            });
          }
        }
      }
    }
  }

  return contents;
}

// Extract rich content from assistant messages - show everything including thinking
export function extractRichContentFromAssistantMessage(message: Message | undefined): ExtractedContent[] {
  if (!message) return [];

  const contents: ExtractedContent[] = [];

  if (typeof message.content === 'string') {
    if (message.content.trim()) {
      contents.push({ type: 'text', text: message.content });
    }
    return contents;
  }

  if (Array.isArray(message.content)) {
    for (const item of message.content) {
      if (item.type === 'text' && item.text) {
        contents.push({ type: 'text', text: item.text });
      } else if (item.type === 'thinking' && item.thinking) {
        // Include thinking process
        contents.push({
          type: 'thinking',
          thinking: item.thinking,
        });
      } else if (item.type === 'tool_use' && item.name) {
        const toolContent: ExtractedContent = {
          type: 'tool',
          toolName: item.name,
        };

        // Extract tool-specific details from input
        if (item.input) {
          const input = item.input as Record<string, unknown>;

          // Description for any tool
          if (input.description && typeof input.description === 'string') {
            toolContent.toolDescription = input.description;
          }

          // Command for Bash tool
          if (item.name === 'Bash' && input.command && typeof input.command === 'string') {
            toolContent.toolCommand = input.command;
          }

          // File path for file operations
          if (input.file_path && typeof input.file_path === 'string') {
            toolContent.toolFilePath = input.file_path;
          } else if (input.path && typeof input.path === 'string') {
            toolContent.toolFilePath = input.path;
          }

          // Pattern for search tools
          if (input.pattern && typeof input.pattern === 'string') {
            toolContent.toolCommand = input.pattern;
          }

          // Content preview for Write tool
          if (item.name === 'Write' && input.content && typeof input.content === 'string') {
            const preview = input.content.substring(0, 200);
            toolContent.toolDescription = preview + (input.content.length > 200 ? '...' : '');
          }

          // AskUserQuestion - extract questions
          if (item.name === 'AskUserQuestion' && input.questions && Array.isArray(input.questions)) {
            toolContent.questions = input.questions.map((q: Record<string, unknown>) => ({
              question: q.question as string || '',
              header: q.header as string || undefined,
              options: Array.isArray(q.options)
                ? q.options.map((opt: Record<string, unknown>) => ({
                    label: opt.label as string || '',
                    description: opt.description as string || undefined,
                  }))
                : [],
            }));
          }
        }

        contents.push(toolContent);
      }
    }
  }

  return contents;
}

// Legacy function for backward compatibility
export function extractTextFromMessage(message: Message | undefined): string {
  if (!message) return '';

  if (typeof message.content === 'string') {
    return message.content;
  }

  if (Array.isArray(message.content)) {
    const parts: string[] = [];

    for (const item of message.content) {
      if (item.type === 'text' && item.text) {
        parts.push(item.text);
      } else if (item.type === 'image') {
        parts.push('[Image]');
      }
    }

    return parts.join('\n');
  }

  return '';
}

// Parse a session file
async function parseSessionFile(filePath: string): Promise<SessionEntry[]> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.trim());

    const entries: SessionEntry[] = [];
    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as SessionEntry;
        entries.push(entry);
      } catch {
        // Skip invalid JSON lines
      }
    }

    return entries;
  } catch {
    return [];
  }
}

// Check if a session is an internal agent warmup session
function isInternalSession(sessionId: string, firstMessage?: string): boolean {
  // Filter out agent warmup sessions (ID starts with "agent-")
  if (sessionId.startsWith('agent-')) return true;

  // Filter out sessions where first message is just "Warmup"
  if (firstMessage?.trim() === 'Warmup') return true;

  return false;
}

// Get all sessions for a project
async function getProjectSessions(projectDir: string): Promise<Session[]> {
  try {
    const files = await fs.readdir(projectDir);
    const sessions: Session[] = [];

    const projectName = decodeProjectPath(path.basename(projectDir));

    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;

      const sessionId = file.replace('.jsonl', '');
      const filePath = path.join(projectDir, file);

      try {
        const stat = await fs.stat(filePath);
        const entries = await parseSessionFile(filePath);

        if (entries.length === 0) continue;

        // Extract summaries
        const summaries = entries
          .filter(e => e.type === 'summary' && e.summary)
          .map(e => e.summary as string);

        // Get first user message as preview
        const firstUserEntry = entries.find(e => e.type === 'user' && e.message);
        const firstMessage = firstUserEntry
          ? extractTextFromMessage(firstUserEntry.message)
          : undefined;

        // Skip internal/warmup sessions
        if (isInternalSession(sessionId, firstMessage)) continue;

        // Count actual user/assistant messages (not just entries)
        const messageCount = entries.filter(e => e.type === 'user' || e.type === 'assistant').length;

        // Skip sessions with very few messages (likely empty or system sessions)
        if (messageCount < 3) continue;

        // Extract custom name from /rename command
        const customName = extractCustomName(entries);

        sessions.push({
          id: sessionId,
          projectPath: projectName,
          projectName: path.basename(projectName),
          summaries,
          messages: entries,
          lastModified: stat.mtime,
          firstMessage,
          customName,
        });
      } catch {
        // Skip files that can't be read
      }
    }

    // Sort by last modified, newest first
    sessions.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());

    return sessions;
  } catch {
    return [];
  }
}

// Get all projects and their sessions
export async function getAllProjects(): Promise<Project[]> {
  try {
    const projectDirs = await fs.readdir(PROJECTS_DIR);
    const projects: Project[] = [];

    for (const dir of projectDirs) {
      if (dir.startsWith('.')) continue;

      const projectDir = path.join(PROJECTS_DIR, dir);
      const stat = await fs.stat(projectDir);

      if (!stat.isDirectory()) continue;

      const projectPath = decodeProjectPath(dir);
      const sessions = await getProjectSessions(projectDir);

      if (sessions.length === 0) continue;

      projects.push({
        path: projectPath,
        name: path.basename(projectPath),
        sessions,
      });
    }

    // Sort by most recent session
    projects.sort((a, b) => {
      const aLatest = a.sessions[0]?.lastModified?.getTime() || 0;
      const bLatest = b.sessions[0]?.lastModified?.getTime() || 0;
      return bLatest - aLatest;
    });

    return projects;
  } catch (error) {
    console.error('Error reading projects:', error);
    return [];
  }
}

// Get a specific session by ID
export async function getSessionById(sessionId: string): Promise<Session | null> {
  try {
    const projectDirs = await fs.readdir(PROJECTS_DIR);

    for (const dir of projectDirs) {
      if (dir.startsWith('.')) continue;

      const projectDir = path.join(PROJECTS_DIR, dir);
      const filePath = path.join(projectDir, `${sessionId}.jsonl`);

      try {
        const stat = await fs.stat(filePath);
        const entries = await parseSessionFile(filePath);

        if (entries.length === 0) continue;

        const projectPath = decodeProjectPath(dir);
        const summaries = entries
          .filter(e => e.type === 'summary' && e.summary)
          .map(e => e.summary as string);

        const firstUserEntry = entries.find(e => e.type === 'user' && e.message);
        const firstMessage = firstUserEntry
          ? extractTextFromMessage(firstUserEntry.message)
          : undefined;

        // Extract custom name from /rename command
        const customName = extractCustomName(entries);

        return {
          id: sessionId,
          projectPath,
          projectName: path.basename(projectPath),
          summaries,
          messages: entries,
          lastModified: stat.mtime,
          firstMessage,
          customName,
        };
      } catch {
        // File doesn't exist in this project, continue searching
      }
    }

    return null;
  } catch {
    return null;
  }
}

// Get all sessions (flat list)
export async function getAllSessions(): Promise<Session[]> {
  const projects = await getAllProjects();
  return projects.flatMap(p => p.sessions);
}

// Delete a session by ID
export async function deleteSessionById(sessionId: string): Promise<boolean> {
  try {
    const projectDirs = await fs.readdir(PROJECTS_DIR);

    for (const dir of projectDirs) {
      if (dir.startsWith('.')) continue;

      const projectDir = path.join(PROJECTS_DIR, dir);
      const filePath = path.join(projectDir, `${sessionId}.jsonl`);

      try {
        await fs.access(filePath);
        // File exists, delete it
        await fs.unlink(filePath);
        return true;
      } catch {
        // File doesn't exist in this project, continue searching
      }
    }

    return false;
  } catch {
    return false;
  }
}
