import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');
const CODEX_DIR = path.join(os.homedir(), '.codex');
const CODEX_SESSIONS_DIR = path.join(CODEX_DIR, 'sessions');
const CODEX_ID_PREFIX = 'codex-';
const MAX_CODEX_TOOL_INPUT_CHARS = 4000;
const MAX_CODEX_TOOL_OUTPUT_CHARS = 8000;

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
export interface TodoItem {
  content: string;
  status: string;
}

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
  todos?: TodoItem[]; // For TodoWrite
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

export interface SummaryWithTimestamp {
  text: string;
  timestamp: string;
}

export interface Session {
  id: string;
  projectPath: string;  // Display path (may be inferred subdirectory)
  projectName: string;
  originalProjectPath: string;  // Original path for terminal resume
  provider?: 'claude' | 'codex';
  summaries: string[];  // Keep for backwards compatibility
  summariesWithTimestamps: SummaryWithTimestamp[];  // New: includes timestamps
  messages: SessionEntry[];
  lastModified: Date;
  firstMessage?: string;
  customName?: string; // User-defined name from /rename command
  isIde?: boolean; // Whether session is from VS Code/IDE
}

export interface Project {
  path: string;
  name: string;
  sessions: Session[];
}

// Parse session content (JSONL format) into a Session object
export function parseSessionContent(sessionId: string, content: string, projectPath: string): Session | null {
  try {
    const lines = content.trim().split('\n');
    const messages: SessionEntry[] = [];
    const summaries: string[] = [];
    const summariesWithTimestamps: SummaryWithTimestamp[] = [];
    let firstMessage: string | undefined;
    let lastTimestamp: Date | null = null;

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const entry = JSON.parse(line) as SessionEntry;
        messages.push(entry);

        // Track timestamp for lastModified
        if (entry.timestamp) {
          const ts = new Date(entry.timestamp);
          if (!lastTimestamp || ts > lastTimestamp) {
            lastTimestamp = ts;
          }
        }

        // Get first user message (clean IDE tags)
        if (!firstMessage && entry.type === 'user' && entry.message?.content) {
          const content = entry.message.content;
          let rawText = '';
          if (typeof content === 'string') {
            rawText = content;
          } else if (Array.isArray(content)) {
            const textBlock = content.find((c: MessageContent) => c.type === 'text');
            if (textBlock && 'text' in textBlock) {
              rawText = textBlock.text || '';
            }
          }
          // Clean IDE tags and truncate
          const cleanedText = cleanIdeTagsFromText(rawText);
          if (cleanedText) {
            firstMessage = cleanedText.slice(0, 100);
          }
        }

        // Get summaries
        if (entry.type === 'summary' && entry.summary) {
          summaries.push(entry.summary);
          summariesWithTimestamps.push({
            text: entry.summary,
            timestamp: entry.timestamp || new Date().toISOString(),
          });
        }

      } catch {
        // Skip invalid JSON lines
      }
    }

    const customName = extractCustomName(messages);

    const projectName = projectPath.split('/').pop() || projectPath;

    // Check if this is an IDE session
    const isIde = isIdeSession(messages);

    return {
      id: sessionId,
      projectPath,
      projectName,
      originalProjectPath: projectPath,
      provider: 'claude',
      summaries,
      summariesWithTimestamps,
      messages,
      lastModified: lastTimestamp || new Date(),
      firstMessage,
      customName,
      isIde,
    };
  } catch (error) {
    console.error('Failed to parse session content:', error);
    return null;
  }
}

interface CodexSessionMeta {
  id?: string;
  timestamp?: string;
  cwd?: string;
  originator?: string;
}

interface CodexEvent {
  timestamp?: string;
  type?: string;
  payload?: Record<string, unknown>;
}

function truncateText(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function toCodexSessionId(rawId: string): string {
  return `${CODEX_ID_PREFIX}${rawId}`;
}

function fromCodexSessionId(sessionId: string): string {
  return sessionId.startsWith(CODEX_ID_PREFIX) ? sessionId.slice(CODEX_ID_PREFIX.length) : sessionId;
}

function extractRawCodexIdFromFilename(filePath: string): string {
  const base = path.basename(filePath, '.jsonl');
  const lastDash = base.lastIndexOf('-');
  if (lastDash === -1 || lastDash === base.length - 1) return base;
  return base.slice(lastDash + 1);
}

function parseCodexArguments(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Keep string arguments as a compact preview.
    }
    return { input: truncateText(raw, MAX_CODEX_TOOL_INPUT_CHARS) };
  }
  return {};
}

function parseCodexToolOutput(raw: unknown): { content: string; isError: boolean } {
  if (typeof raw !== 'string') {
    const serialized = JSON.stringify(raw);
    return {
      content: truncateText(serialized || '', MAX_CODEX_TOOL_OUTPUT_CHARS),
      isError: false,
    };
  }

  let content = raw;
  let isError = /Exit code:\s*[1-9][0-9]*/i.test(raw);

  try {
    const parsed = JSON.parse(raw) as {
      output?: unknown;
      metadata?: { exit_code?: unknown };
    };
    if (parsed && typeof parsed === 'object') {
      if (typeof parsed.output === 'string' && parsed.output.trim()) {
        content = parsed.output;
      }
      if (parsed.metadata && typeof parsed.metadata.exit_code === 'number') {
        isError = parsed.metadata.exit_code !== 0;
      }
    }
  } catch {
    // Keep raw output as-is when not JSON.
  }

  return {
    content: truncateText(content, MAX_CODEX_TOOL_OUTPUT_CHARS),
    isError,
  };
}

function normalizeCodexBootstrapText(text: string): string {
  if (!text) return '';

  let cleaned = text;
  cleaned = cleaned.replace(/<environment_context>[\s\S]*?<\/environment_context>/gi, '').trim();
  cleaned = cleaned.replace(/^# AGENTS\.md instructions[\s\S]*?<\/INSTRUCTIONS>/im, '').trim();

  const requestMarker = '## My request for Codex:';
  const requestIndex = cleaned.indexOf(requestMarker);
  if (requestIndex >= 0) {
    cleaned = cleaned.slice(requestIndex + requestMarker.length).trim();
  }

  return cleaned.trim();
}

function parseCodexMessageContent(
  rawBlocks: unknown,
  role: 'user' | 'assistant'
): string | MessageContent[] {
  if (!Array.isArray(rawBlocks)) return '';

  const blocks: MessageContent[] = [];
  for (const rawBlock of rawBlocks) {
    if (!rawBlock || typeof rawBlock !== 'object') continue;
    const block = rawBlock as Record<string, unknown>;
    const blockType = typeof block.type === 'string' ? block.type : '';

    if ((blockType === 'input_text' || blockType === 'output_text' || blockType === 'text') && typeof block.text === 'string') {
      blocks.push({ type: 'text', text: block.text });
      continue;
    }

    // Avoid huge inline image payloads in session previews/details.
    if (blockType === 'input_image') {
      blocks.push({ type: 'text', text: '[Image]' });
      continue;
    }

    if (typeof block.text === 'string') {
      blocks.push({ type: 'text', text: block.text });
      continue;
    }

    if (typeof block.content === 'string') {
      blocks.push({ type: 'text', text: block.content });
      continue;
    }
  }

  if (blocks.length === 0) return '';
  if (blocks.length === 1 && blocks[0].type === 'text') {
    const text = blocks[0].text || '';
    return role === 'user' ? normalizeCodexBootstrapText(text) : text;
  }

  return blocks.map((block) => {
    if (block.type === 'text' && block.text) {
      return { ...block, text: role === 'user' ? normalizeCodexBootstrapText(block.text) : block.text };
    }
    return block;
  }).filter((block) => !(block.type === 'text' && !block.text));
}

function codexEventToSessionEntries(event: CodexEvent): SessionEntry[] {
  const eventType = event.type || '';
  const payload = event.payload || {};
  const timestamp = event.timestamp;

  if (eventType !== 'response_item') return [];

  const payloadType = typeof payload.type === 'string' ? payload.type : '';
  if (payloadType === 'message') {
    const role = payload.role === 'assistant' ? 'assistant' : 'user';
    const content = parseCodexMessageContent(payload.content, role);
    if ((typeof content === 'string' && !content.trim()) || (Array.isArray(content) && content.length === 0)) {
      return [];
    }
    return [{
      type: role,
      uuid: typeof payload.id === 'string' ? payload.id : undefined,
      timestamp,
      message: {
        role,
        content,
      },
    }];
  }

  if (payloadType === 'reasoning') {
    const summaryText = Array.isArray(payload.summary)
      ? payload.summary
          .map((item) => {
            if (!item || typeof item !== 'object') return '';
            const block = item as Record<string, unknown>;
            if (typeof block.text === 'string') return block.text;
            if (typeof block.summary_text === 'string') return block.summary_text;
            return '';
          })
          .filter(Boolean)
          .join('\n')
      : '';

    if (!summaryText.trim()) return [];
    return [{
      type: 'assistant',
      uuid: typeof payload.id === 'string' ? payload.id : undefined,
      timestamp,
      message: {
        role: 'assistant',
        content: [{
          type: 'thinking',
          thinking: summaryText,
        }],
      },
    }];
  }

  if (payloadType === 'function_call' || payloadType === 'custom_tool_call') {
    const callId = typeof payload.call_id === 'string' ? payload.call_id : undefined;
    const toolName = typeof payload.name === 'string' ? payload.name : 'tool_call';
    const rawArgs = payloadType === 'function_call' ? payload.arguments : payload.input;
    const input = parseCodexArguments(rawArgs);

    return [{
      type: 'assistant',
      uuid: callId,
      timestamp,
      message: {
        role: 'assistant',
        content: [{
          type: 'tool_use',
          id: callId,
          name: toolName,
          input,
        }],
      },
    }];
  }

  if (payloadType === 'function_call_output' || payloadType === 'custom_tool_call_output') {
    const callId = typeof payload.call_id === 'string' ? payload.call_id : undefined;
    const parsedOutput = parseCodexToolOutput(payload.output);
    if (!parsedOutput.content.trim()) return [];

    return [{
      type: 'user',
      uuid: callId,
      timestamp,
      message: {
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: callId,
          content: parsedOutput.content,
          is_error: parsedOutput.isError,
        }],
      },
    }];
  }

  return [];
}

function getFirstCodexUserMessage(entries: SessionEntry[]): string | undefined {
  for (const entry of entries) {
    if (entry.type !== 'user' || !entry.message) continue;
    const text = extractTextFromUserMessage(entry.message);
    const cleaned = normalizeCodexBootstrapText(text).trim();
    if (cleaned) {
      return cleaned.slice(0, 140);
    }
  }
  return undefined;
}

async function parseCodexSessionFile(filePath: string): Promise<Session | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim());

    let meta: CodexSessionMeta | undefined;
    let lastTimestamp: Date | null = null;
    const entries: SessionEntry[] = [];

    for (const line of lines) {
      try {
        const event = JSON.parse(line) as CodexEvent;
        if (!event || typeof event !== 'object') continue;

        if (event.timestamp) {
          const ts = new Date(event.timestamp);
          if (!lastTimestamp || ts > lastTimestamp) {
            lastTimestamp = ts;
          }
        }

        if (event.type === 'session_meta' && event.payload) {
          meta = event.payload as CodexSessionMeta;
          continue;
        }

        entries.push(...codexEventToSessionEntries(event));
      } catch {
        // Skip malformed lines
      }
    }

    const messageCount = entries.filter((entry) => entry.type === 'user' || entry.type === 'assistant').length;
    if (messageCount === 0) return null;

    const rawId = (meta?.id && meta.id.trim()) || extractRawCodexIdFromFilename(filePath);
    const sessionId = toCodexSessionId(rawId);
    const projectPath = (meta?.cwd && meta.cwd.trim()) || path.join(os.homedir(), '.codex');
    const projectName = path.basename(projectPath) || projectPath;
    const firstMessage = getFirstCodexUserMessage(entries);
    const summaryText = firstMessage || `Codex 会话 ${rawId.slice(0, 8)}`;

    return {
      id: sessionId,
      projectPath,
      projectName,
      originalProjectPath: projectPath,
      provider: 'codex',
      summaries: [summaryText],
      summariesWithTimestamps: [{
        text: summaryText,
        timestamp: meta?.timestamp || lastTimestamp?.toISOString() || new Date().toISOString(),
      }],
      messages: entries,
      lastModified: lastTimestamp || new Date(),
      firstMessage,
      customName: undefined,
      isIde: typeof meta?.originator === 'string' && meta.originator.includes('vscode'),
    };
  } catch {
    return null;
  }
}

async function listCodexSessionFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...await listCodexSessionFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        files.push(fullPath);
      }
    }

    return files;
  } catch {
    return [];
  }
}

async function getAllCodexSessions(): Promise<Session[]> {
  const files = await listCodexSessionFiles(CODEX_SESSIONS_DIR);
  const sessions: Session[] = [];

  for (const filePath of files) {
    const session = await parseCodexSessionFile(filePath);
    if (session) {
      sessions.push(session);
    }
  }

  sessions.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
  return sessions;
}

async function findCodexSessionById(sessionId: string): Promise<Session | null> {
  const rawId = fromCodexSessionId(sessionId);
  const files = await listCodexSessionFiles(CODEX_SESSIONS_DIR);

  // Fast path: filename usually ends with raw session id.
  const directFile = files.find((filePath) => filePath.includes(rawId));
  if (directFile) {
    const session = await parseCodexSessionFile(directFile);
    if (session && fromCodexSessionId(session.id) === rawId) {
      return session;
    }
  }

  for (const filePath of files) {
    const session = await parseCodexSessionFile(filePath);
    if (session && fromCodexSessionId(session.id) === rawId) {
      return session;
    }
  }

  return null;
}

async function deleteCodexSessionById(sessionId: string): Promise<boolean> {
  const rawId = fromCodexSessionId(sessionId);
  const files = await listCodexSessionFiles(CODEX_SESSIONS_DIR);
  const target = files.find((filePath) => filePath.includes(rawId));

  if (!target) return false;

  try {
    await fs.unlink(target);
    return true;
  } catch {
    return false;
  }
}

// Decode project directory name to actual path
// Handles folder names that contain hyphens (e.g., claude-hub)
function decodeProjectPath(encodedName: string): string {
  const fsStat = require('fs');

  // Simple decode: replace all hyphens with slashes
  const simpleDecode = encodedName.replace(/-/g, '/');

  // Check if simple decode results in an existing path
  if (fsStat.existsSync(simpleDecode)) {
    return simpleDecode;
  }

  // Smart decode: try to find the actual path by checking directory existence
  // Split by hyphen and try to reconstruct the path
  const parts = encodedName.split('-').filter(p => p); // Remove empty parts from leading -

  if (parts.length === 0) return simpleDecode;

  let currentPath = '';
  let remainingParts = [...parts];

  while (remainingParts.length > 0) {
    // Try adding next part with slash
    const nextPart = remainingParts[0];
    const testPath = currentPath + '/' + nextPart;

    if (fsStat.existsSync(testPath)) {
      currentPath = testPath;
      remainingParts.shift();
    } else {
      // Try combining with hyphen (folder name contains hyphen)
      let combined = nextPart;
      let found = false;

      for (let i = 1; i < remainingParts.length && !found; i++) {
        combined += '-' + remainingParts[i];
        const testCombined = currentPath + '/' + combined;

        if (fsStat.existsSync(testCombined)) {
          currentPath = testCombined;
          remainingParts = remainingParts.slice(i + 1);
          found = true;
        }
      }

      if (!found) {
        // Couldn't find existing path, use simple slash separator
        currentPath = currentPath + '/' + nextPart;
        remainingParts.shift();
      }
    }
  }

  return currentPath || simpleDecode;
}

// Infer actual project path from session entries by analyzing file operations
function inferProjectPath(entries: SessionEntry[], fallbackPath: string): string {
  try {
    const filePaths: string[] = [];

    for (const entry of entries) {
      if (entry.type !== 'assistant' || !entry.message?.content) continue;

      const content = entry.message.content;
      if (!Array.isArray(content)) continue;

      for (const block of content) {
        if (block.type !== 'tool_use') continue;
        if (!block.input || typeof block.input !== 'object') continue;

        const input = block.input as Record<string, unknown>;

        // Extract file paths from various tools
        if (block.name === 'Read' || block.name === 'Write' || block.name === 'Edit') {
          if (typeof input.file_path === 'string' && input.file_path.startsWith('/')) {
            filePaths.push(input.file_path);
          }
        } else if (block.name === 'Bash') {
          // Try to extract paths from bash commands (e.g., cd /path, npm run in /path)
          const cmd = input.command;
          if (typeof cmd === 'string') {
            const cdMatch = cmd.match(/cd\s+["']?([\/][^"'\s;]+)/);
            if (cdMatch) filePaths.push(cdMatch[1]);
          }
        } else if (block.name === 'Glob' || block.name === 'Grep') {
          if (typeof input.path === 'string' && input.path.startsWith('/')) {
            filePaths.push(input.path);
          }
        }
      }
    }

    if (filePaths.length === 0) return fallbackPath;

    // Find the common path prefix that's more specific than fallbackPath
    // Filter paths that start with the fallback path
    const relevantPaths = filePaths.filter(p => p.startsWith(fallbackPath + '/'));

    if (relevantPaths.length === 0) return fallbackPath;

    // Extract the project directory (first subdirectory after fallbackPath)
    const projectDirs = new Map<string, number>();

    for (const p of relevantPaths) {
      const relativePath = p.substring(fallbackPath.length + 1);
      const firstDir = relativePath.split('/')[0];
      if (firstDir && !firstDir.includes('.')) {
        projectDirs.set(firstDir, (projectDirs.get(firstDir) || 0) + 1);
      }
    }

    if (projectDirs.size === 0) return fallbackPath;

    // Get the most common project directory
    let maxCount = 0;
    let inferredDir = '';
    for (const [dir, count] of projectDirs) {
      if (count > maxCount) {
        maxCount = count;
        inferredDir = dir;
      }
    }

    // Only use inferred path if it appears in at least 2 file operations
    if (maxCount >= 2 && inferredDir) {
      return `${fallbackPath}/${inferredDir}`;
    }

    return fallbackPath;
  } catch {
    // If any error occurs, just return the fallback path
    return fallbackPath;
  }
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

// Extract the active session title. Scans newest → oldest; first match wins,
// so the latest rename (from any source — terminal /rename or Claude Hub) takes effect.
//
// Claude Code's actual title-persistence entries are:
//   { type: "custom-title", customTitle: "...", sessionId: "..." }
//   { type: "agent-name",   agentName:   "...", sessionId: "..." }
// These are what `claude --resume` reads on startup. The visible
//   <local-command-stdout>Session renamed to: ...</local-command-stdout>
// line is just UI echo. We accept all three formats (and Hub's legacy
// "/rename xxx" user message) so we stay compatible with whatever already
// exists in older session files.
function extractCustomName(entries: SessionEntry[]): string | undefined {
  const STDOUT_RE = /<local-command-stdout>Session renamed to:\s*(.+?)<\/local-command-stdout>/;

  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i] as SessionEntry & {
      subtype?: string;
      content?: string;
      customTitle?: string;
      agentName?: string;
    };

    if (entry.type === 'custom-title' && typeof entry.customTitle === 'string' && entry.customTitle.trim()) {
      return entry.customTitle.trim();
    }
    if (entry.type === 'agent-name' && typeof entry.agentName === 'string' && entry.agentName.trim()) {
      return entry.agentName.trim();
    }

    // Terminal /rename UI echo line.
    if (entry.type === 'system' && entry.subtype === 'local_command' && typeof entry.content === 'string') {
      const m = entry.content.match(STDOUT_RE);
      if (m && m[1]) return m[1].trim();
    }

    // Legacy Hub-written formats.
    if (entry.type === 'user' && entry.message) {
      const content = entry.message.content;
      const textContent = typeof content === 'string' ? content :
        Array.isArray(content) ? content.find(c => c.type === 'text')?.text : undefined;
      if (textContent) {
        const m = textContent.match(STDOUT_RE);
        if (m && m[1]) return m[1].trim();
        if (textContent.startsWith('/rename ')) {
          return textContent.replace('/rename ', '').trim();
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

// Clean IDE-specific tags from text
function cleanIdeTagsFromText(text: string): string {
  if (!text) return '';
  // Remove <ide_opened_file>...</ide_opened_file> tags
  let cleaned = text.replace(/<ide_opened_file>[\s\S]*?<\/ide_opened_file>/g, '').trim();
  // Remove <ide_context>...</ide_context> tags
  cleaned = cleaned.replace(/<ide_context>[\s\S]*?<\/ide_context>/g, '').trim();
  // Remove <ide_selection>...</ide_selection> tags
  cleaned = cleaned.replace(/<ide_selection>[\s\S]*?<\/ide_selection>/g, '').trim();
  // Debug log
  if (text.includes('<ide_opened_file>')) {
    console.log('[cleanIdeTagsFromText] Input:', text.slice(0, 100), '... Output:', cleaned.slice(0, 100));
  }
  return cleaned;
}

// Check if a session is from VS Code/IDE
// Only check the FIRST user message - IDE sessions always start with IDE context tags
export function isIdeSession(entries: SessionEntry[]): boolean {
  // Find the first user message
  const firstUserEntry = entries.find(e => e.type === 'user' && e.message?.content);
  if (!firstUserEntry || !firstUserEntry.message?.content) return false;

  const content = firstUserEntry.message.content;
  const textContent = typeof content === 'string' ? content :
    Array.isArray(content) ? content.map(c => c.type === 'text' ? c.text : '').join('') : '';

  // IDE sessions always have these tags in the first message
  return textContent.includes('<ide_opened_file>') ||
         textContent.includes('<ide_context>') ||
         textContent.includes('<ide_selection>');
}

// Extract text from message content for user messages
export function extractTextFromUserMessage(message: Message | undefined): string {
  if (!message) return '';

  if (typeof message.content === 'string') {
    // Filter out system messages
    if (isHiddenSystemMessage(message.content)) return '';
    // Clean IDE tags
    return cleanIdeTagsFromText(message.content);
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
          // Clean IDE tags from the text
          const cleanedText = cleanIdeTagsFromText(item.text);
          if (cleanedText) {
            parts.push(cleanedText);
          }
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

          // TodoWrite - extract todos
          if (item.name === 'TodoWrite' && input.todos && Array.isArray(input.todos)) {
            toolContent.todos = input.todos.map((t: Record<string, unknown>) => ({
              content: t.content as string || '',
              status: t.status as string || 'pending',
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
    // Clean IDE tags from the content
    return cleanIdeTagsFromText(message.content);
  }

  if (Array.isArray(message.content)) {
    const parts: string[] = [];

    for (const item of message.content) {
      if (item.type === 'text' && item.text) {
        // Collect text parts first (IDE tags may span multiple elements)
        parts.push(item.text);
      } else if (item.type === 'image') {
        parts.push('[Image]');
      }
    }

    // Clean IDE tags AFTER joining (tags may span multiple array elements)
    return cleanIdeTagsFromText(parts.join('\n'));
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
        const summaryEntries = entries.filter(e => e.type === 'summary' && e.summary);
        const summaries = summaryEntries.map(e => e.summary as string);
        const summariesWithTimestamps: SummaryWithTimestamp[] = summaryEntries.map(e => ({
          text: e.summary as string,
          timestamp: e.timestamp || new Date().toISOString(),
        }));

        // Get first user message as preview
        const firstUserEntry = entries.find(e => e.type === 'user' && e.message);
        const firstMessage = firstUserEntry
          ? extractTextFromMessage(firstUserEntry.message)
          : undefined;

        // Skip internal/warmup sessions
        if (isInternalSession(sessionId, firstMessage)) continue;

        // Count actual user/assistant messages (not just entries)
        const messageCount = entries.filter(e => e.type === 'user' || e.type === 'assistant').length;

        // Skip sessions with no messages (truly empty sessions)
        if (messageCount === 0) continue;

        // Extract custom name from /rename command
        const customName = extractCustomName(entries);

        // Infer actual project path from file operations in the session
        const inferredPath = inferProjectPath(entries, projectName);

        // Check if this is an IDE session
        const isIde = isIdeSession(entries);

        sessions.push({
          id: sessionId,
          projectPath: inferredPath,
          projectName: path.basename(inferredPath),
          originalProjectPath: projectName,  // Keep original for terminal resume
          provider: 'claude',
          summaries,
          summariesWithTimestamps,
          messages: entries,
          lastModified: stat.mtime,
          firstMessage,
          customName,
          isIde,
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
  const projects: Project[] = [];

  // Claude sessions
  try {
    const projectDirs = await fs.readdir(PROJECTS_DIR);
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
  } catch (error) {
    console.error('Error reading Claude projects:', error);
  }

  // Codex sessions
  try {
    const codexSessions = await getAllCodexSessions();
    const projectMap = new Map(projects.map((project) => [project.path, project]));

    for (const session of codexSessions) {
      const existingProject = projectMap.get(session.projectPath);
      if (existingProject) {
        existingProject.sessions.push(session);
      } else {
        const newProject: Project = {
          path: session.projectPath,
          name: path.basename(session.projectPath) || session.projectPath,
          sessions: [session],
        };
        projects.push(newProject);
        projectMap.set(newProject.path, newProject);
      }
    }
  } catch (error) {
    console.error('Error reading Codex sessions:', error);
  }

  for (const project of projects) {
    project.sessions.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
  }

  // Sort by most recent session
  projects.sort((a, b) => {
    const aLatest = a.sessions[0]?.lastModified?.getTime() || 0;
    const bLatest = b.sessions[0]?.lastModified?.getTime() || 0;
    return bLatest - aLatest;
  });

  return projects;
}

// Get a specific session by ID
export async function getSessionById(sessionId: string): Promise<Session | null> {
  if (sessionId.startsWith(CODEX_ID_PREFIX)) {
    return findCodexSessionById(sessionId);
  }

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
        const summaryEntries = entries.filter(e => e.type === 'summary' && e.summary);
        const summaries = summaryEntries.map(e => e.summary as string);
        const summariesWithTimestamps: SummaryWithTimestamp[] = summaryEntries.map(e => ({
          text: e.summary as string,
          timestamp: e.timestamp || new Date().toISOString(),
        }));

        const firstUserEntry = entries.find(e => e.type === 'user' && e.message);
        const firstMessage = firstUserEntry
          ? extractTextFromMessage(firstUserEntry.message)
          : undefined;

        // Extract custom name from /rename command
        const customName = extractCustomName(entries);

        // Check if this is an IDE session
        const isIde = isIdeSession(entries);

        return {
          id: sessionId,
          projectPath,
          projectName: path.basename(projectPath),
          originalProjectPath: projectPath,
          provider: 'claude',
          summaries,
          summariesWithTimestamps,
          messages: entries,
          lastModified: stat.mtime,
          firstMessage,
          customName,
          isIde,
        };
      } catch {
        // File doesn't exist in this project, continue searching
      }
    }
    // Fallback: tolerate callers that pass raw Codex IDs without prefix.
    const codexSession = await findCodexSessionById(toCodexSessionId(sessionId));
    return codexSession;
  } catch {
    const codexSession = await findCodexSessionById(sessionId);
    return codexSession;
  }
}

// Get all sessions (flat list)
export async function getAllSessions(): Promise<Session[]> {
  const projects = await getAllProjects();
  return projects.flatMap(p => p.sessions);
}

// Delete a session by ID
export async function deleteSessionById(sessionId: string): Promise<boolean> {
  if (sessionId.startsWith(CODEX_ID_PREFIX)) {
    return deleteCodexSessionById(sessionId);
  }

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
    // Fallback: tolerate callers that pass raw Codex IDs without prefix.
    const deletedCodex = await deleteCodexSessionById(toCodexSessionId(sessionId));
    return deletedCodex;
  } catch {
    const deletedCodex = await deleteCodexSessionById(sessionId);
    return deletedCodex;
  }
}
