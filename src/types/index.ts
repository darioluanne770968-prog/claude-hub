// Session source type
export interface SessionSource {
    type: 'local' | 'remote';
    hostId?: string;
    hostName?: string;
}

// Base session interface
export interface SessionBase {
    id: string;
    projectPath: string;
    projectName: string;
    summaries: string[];
    customName?: string;
    lastModified: string;
    firstMessage?: string;
    messageCount: number;
    tags?: string[];
}

// Session with source info (for UI)
export interface Session extends SessionBase {
    source?: SessionSource;
}

// Project containing sessions
export interface Project {
    name: string;
    path: string;
    sessions: Session[];
}

// Message content types
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
    source?: ImageSource;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
    tool_use_id?: string;
    content?: string;
    is_error?: boolean;
}

export interface Message {
    role: 'user' | 'assistant';
    content: string | MessageContent[];
}

// Question types for AskUserQuestion tool
export interface QuestionOption {
    label: string;
    description?: string;
}

export interface Question {
    question: string;
    header?: string;
    options: QuestionOption[];
}

// Todo item for TodoWrite tool
export interface TodoItem {
    content: string;
    status: string;
}

// Extracted content for display
export interface ExtractedContent {
    type: 'text' | 'image' | 'tool' | 'thinking' | 'command' | 'command-result' | 'user-answer' | 'context-summary';
    text?: string;
    imageData?: string;
    toolName?: string;
    toolDescription?: string;
    toolCommand?: string;
    toolFilePath?: string;
    thinking?: string;
    commandName?: string;
    commandArgs?: string;
    commandResult?: string;
    isError?: boolean;
    questions?: Question[];
    userAnswers?: Record<string, string>;
    summaryText?: string;
    todos?: TodoItem[];
}

// Session entry from JSONL file
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

// Remote host configuration
export interface RemoteHost {
    id: string;
    name: string;
    hostname: string;
    port: number;
    username: string;
    authType: 'password' | 'key';
    password?: string;
    privateKeyPath?: string;
    passphrase?: string;
    enabled: boolean;
}

// Webhook configuration
export interface Webhook {
    id: string;
    name: string;
    url: string;
    events: string[];
    enabled: boolean;
    secret?: string | null;
    createdAt?: string;
}

// API response types
export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
}

export interface SessionsResponse {
    projects: Project[];
    tags?: string[];
}

export interface StatsResponse {
    total_sessions: number;
    total_messages: number;
    total_projects: number;
    favorite_count: number;
    archived_count: number;
}
