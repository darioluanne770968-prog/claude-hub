'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ArrowLeft,
  RefreshCw,
  User,
  Bot,
  Clock,
  FolderOpen,
  Send,
  Terminal,
  FileCode,
  Search,
  Settings,
  Brain,
  Hash,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  MessageSquare,
  FileText,
} from 'lucide-react';
import Link from 'next/link';

interface QuestionOption {
  label: string;
  description?: string;
}

interface Question {
  question: string;
  header?: string;
  options: QuestionOption[];
}

interface ContentItem {
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
}

interface Message {
  type: string;
  uuid: string;
  timestamp: string;
  richContent: ContentItem[];
  role: string;
}

interface SessionDetail {
  id: string;
  projectPath: string;
  projectName: string;
  summaries: string[];
  customName?: string;
  lastModified: string;
  messages: Message[];
}

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const fetchSession = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/sessions/${id}`);
        if (res.ok) {
          const data = await res.json();
          setSession(data);
        }
      } catch (error) {
        console.error('Failed to fetch session:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSession();
  }, [id]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;

    setSending(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: input,
          sessionId: id,
          projectPath: session?.projectPath,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        // Add the new messages to the session
        if (session) {
          setSession({
            ...session,
            messages: [
              ...session.messages,
              {
                type: 'user',
                uuid: Date.now().toString(),
                timestamp: new Date().toISOString(),
                richContent: [{ type: 'text', text: input }],
                role: 'user',
              },
              {
                type: 'assistant',
                uuid: (Date.now() + 1).toString(),
                timestamp: new Date().toISOString(),
                richContent: [{ type: 'text', text: data.response }],
                role: 'assistant',
              },
            ],
          });
        }
        setInput('');
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <RefreshCw size={24} className="animate-spin text-zinc-500" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-4">
        <p className="text-zinc-500">Session not found</p>
        <Link href="/" className="text-amber-500 hover:underline">
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            >
              <ArrowLeft size={20} />
            </button>

            <div className="flex-1 min-w-0">
              <h1 className="font-medium text-white truncate">
                {session.customName || session.summaries[0] || 'Session ' + session.id.slice(0, 8)}
              </h1>
              <div className="flex items-center gap-4 text-sm text-zinc-500 mt-1">
                <div className="flex items-center gap-1">
                  <FolderOpen size={14} />
                  <span>{session.projectName}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock size={14} />
                  <span>
                    {formatDistanceToNow(new Date(session.lastModified), {
                      addSuffix: true,
                      locale: zhCN,
                    })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
          {session.messages.map((message, index) => {
            // Check if message contains user-answer (should display on user side)
            const hasUserAnswer = message.richContent.some(item => item.type === 'user-answer');
            // Check if message is a context summary (should display on system/assistant side)
            const hasContextSummary = message.richContent.some(item => item.type === 'context-summary');
            // Check if message is only command-result (system output, should display on assistant side)
            const isOnlyCommandResult = message.richContent.length > 0 &&
              message.richContent.every(item => item.type === 'command-result');
            // Tool results, context summaries, and command results should display on assistant side
            // except user-answer which is user's response
            const isUserMessage = (message.role === 'user' && message.type !== 'tool-result' && !hasContextSummary && !isOnlyCommandResult) || hasUserAnswer;

            return (
            <div
              key={message.uuid || index}
              className={`flex gap-3 ${
                isUserMessage ? 'flex-row-reverse' : ''
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  isUserMessage
                    ? 'bg-amber-500/20 text-amber-500'
                    : 'bg-blue-500/20 text-blue-500'
                }`}
              >
                {isUserMessage ? <User size={16} /> : <Bot size={16} />}
              </div>

              <div
                className={`flex-1 max-w-[85%] ${
                  isUserMessage ? 'text-right' : ''
                }`}
              >
                <div
                  className={`inline-block rounded-lg px-4 py-3 ${
                    isUserMessage
                      ? 'bg-amber-500/10 border border-amber-500/20 text-white'
                      : 'bg-zinc-900 border border-zinc-800 text-zinc-300'
                  }`}
                >
                  <div className="space-y-2">
                    {message.richContent.map((item, i) => {
                      if (item.type === 'text' && item.text) {
                        return (
                          <div key={i} className="text-sm markdown-content prose prose-invert prose-sm max-w-none">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                // 自定义链接样式
                                a: ({ href, children }) => (
                                  <a href={href} target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:text-amber-300 underline">
                                    {children}
                                  </a>
                                ),
                                // 代码块样式
                                code: ({ className, children, ...props }) => {
                                  const isInline = !className;
                                  return isInline ? (
                                    <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-amber-300 text-xs" {...props}>
                                      {children}
                                    </code>
                                  ) : (
                                    <code className={`${className} text-xs`} {...props}>
                                      {children}
                                    </code>
                                  );
                                },
                                // 代码块容器
                                pre: ({ children }) => (
                                  <pre className="bg-zinc-800 p-3 rounded-lg overflow-x-auto my-2">
                                    {children}
                                  </pre>
                                ),
                                // 表格样式
                                table: ({ children }) => (
                                  <div className="overflow-x-auto my-2">
                                    <table className="min-w-full border-collapse border border-zinc-700">
                                      {children}
                                    </table>
                                  </div>
                                ),
                                th: ({ children }) => (
                                  <th className="border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-left text-xs font-medium">
                                    {children}
                                  </th>
                                ),
                                td: ({ children }) => (
                                  <td className="border border-zinc-700 px-3 py-1.5 text-xs">
                                    {children}
                                  </td>
                                ),
                                // 列表样式
                                ul: ({ children }) => (
                                  <ul className="list-disc list-inside my-1 space-y-0.5">
                                    {children}
                                  </ul>
                                ),
                                ol: ({ children }) => (
                                  <ol className="list-decimal list-inside my-1 space-y-0.5">
                                    {children}
                                  </ol>
                                ),
                                li: ({ children }) => (
                                  <li className="text-zinc-300">
                                    {children}
                                  </li>
                                ),
                                // 标题样式
                                h1: ({ children }) => (
                                  <h1 className="text-lg font-bold text-white mt-3 mb-2">{children}</h1>
                                ),
                                h2: ({ children }) => (
                                  <h2 className="text-base font-bold text-white mt-3 mb-1.5">{children}</h2>
                                ),
                                h3: ({ children }) => (
                                  <h3 className="text-sm font-semibold text-white mt-2 mb-1">{children}</h3>
                                ),
                                // 分割线
                                hr: () => (
                                  <hr className="border-zinc-700 my-3" />
                                ),
                                // 段落
                                p: ({ children }) => (
                                  <p className="my-1 leading-relaxed">{children}</p>
                                ),
                                // 加粗
                                strong: ({ children }) => (
                                  <strong className="font-semibold text-white">{children}</strong>
                                ),
                                // 引用
                                blockquote: ({ children }) => (
                                  <blockquote className="border-l-2 border-zinc-600 pl-3 my-2 text-zinc-400 italic">
                                    {children}
                                  </blockquote>
                                ),
                              }}
                            >
                              {item.text}
                            </ReactMarkdown>
                          </div>
                        );
                      }
                      if (item.type === 'image' && item.imageData) {
                        return (
                          <img
                            key={i}
                            src={item.imageData}
                            alt="User uploaded image"
                            className="max-w-full max-h-96 rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                            onClick={() => window.open(item.imageData, '_blank')}
                          />
                        );
                      }
                      if (item.type === 'thinking' && item.thinking) {
                        return (
                          <details
                            key={i}
                            className="text-sm bg-purple-500/10 border border-purple-500/30 rounded-lg overflow-hidden"
                          >
                            <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-purple-500/20 transition-colors">
                              <Brain size={14} className="text-purple-400" />
                              <span className="text-purple-400 font-medium">思考过程</span>
                              <span className="text-zinc-500 text-xs ml-2">点击展开</span>
                            </summary>
                            <div className="px-3 py-2 text-xs text-zinc-400 whitespace-pre-wrap bg-zinc-900/50 max-h-96 overflow-y-auto">
                              {item.thinking}
                            </div>
                          </details>
                        );
                      }
                      if (item.type === 'command' && item.commandName) {
                        return (
                          <div
                            key={i}
                            className="text-sm bg-amber-500/10 border border-amber-500/30 rounded-lg overflow-hidden"
                          >
                            <div className="flex items-center gap-2 px-3 py-2">
                              <Hash size={14} className="text-amber-400" />
                              <span className="text-amber-400 font-medium">{item.commandName}</span>
                              {item.commandArgs && (
                                <span className="text-zinc-300 ml-2">{item.commandArgs}</span>
                              )}
                            </div>
                          </div>
                        );
                      }
                      if (item.type === 'command-result' && item.commandResult) {
                        return (
                          <div
                            key={i}
                            className={`text-sm rounded-lg overflow-hidden ${
                              item.isError
                                ? 'bg-red-500/10 border border-red-500/30'
                                : 'bg-green-500/10 border border-green-500/30'
                            }`}
                          >
                            <div className="flex items-center gap-2 px-3 py-2">
                              {item.isError ? (
                                <XCircle size={14} className="text-red-400" />
                              ) : (
                                <CheckCircle size={14} className="text-green-400" />
                              )}
                              <span className={item.isError ? 'text-red-400' : 'text-green-400'}>
                                {item.isError ? '执行失败' : '执行结果'}
                              </span>
                            </div>
                            <div className="px-3 py-2 text-xs text-zinc-300 whitespace-pre-wrap bg-zinc-900/50 max-h-48 overflow-y-auto font-mono">
                              {item.commandResult}
                            </div>
                          </div>
                        );
                      }
                      if (item.type === 'user-answer' && item.userAnswers) {
                        return (
                          <div
                            key={i}
                            className="text-sm bg-amber-500/10 border border-amber-500/30 rounded-lg overflow-hidden"
                          >
                            <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/20 border-b border-amber-500/30">
                              <MessageSquare size={14} className="text-amber-400" />
                              <span className="text-amber-400 font-medium">我的回答</span>
                            </div>
                            <div className="px-3 py-2 space-y-2">
                              {Object.entries(item.userAnswers).map(([question, answer], idx) => (
                                <div key={idx} className="text-xs">
                                  <div className="text-zinc-400 mb-1">Q: {question}</div>
                                  <div className="text-amber-300 font-medium pl-3">A: {answer}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      }
                      if (item.type === 'context-summary' && item.summaryText) {
                        return (
                          <details
                            key={i}
                            className="text-sm bg-slate-500/10 border border-slate-500/30 rounded-lg overflow-hidden"
                          >
                            <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-500/20 transition-colors">
                              <FileText size={14} className="text-slate-400" />
                              <span className="text-slate-400 font-medium">上下文摘要</span>
                              <span className="text-zinc-500 text-xs ml-2">对话延续自上一个会话，点击展开查看摘要</span>
                            </summary>
                            <div className="px-3 py-2 text-xs text-zinc-400 bg-zinc-900/50 max-h-96 overflow-y-auto">
                              <div className="prose prose-invert prose-xs max-w-none">
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm]}
                                  components={{
                                    a: ({ href, children }) => (
                                      <a href={href} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-slate-300 underline">
                                        {children}
                                      </a>
                                    ),
                                    code: ({ className, children, ...props }) => (
                                      <code className="bg-zinc-800 px-1 py-0.5 rounded text-slate-300 text-xs" {...props}>
                                        {children}
                                      </code>
                                    ),
                                    pre: ({ children }) => (
                                      <pre className="bg-zinc-800 p-2 rounded overflow-x-auto my-1">
                                        {children}
                                      </pre>
                                    ),
                                    h1: ({ children }) => (
                                      <h1 className="text-sm font-bold text-slate-300 mt-2 mb-1">{children}</h1>
                                    ),
                                    h2: ({ children }) => (
                                      <h2 className="text-xs font-bold text-slate-300 mt-2 mb-1">{children}</h2>
                                    ),
                                    h3: ({ children }) => (
                                      <h3 className="text-xs font-semibold text-slate-300 mt-1 mb-0.5">{children}</h3>
                                    ),
                                    ul: ({ children }) => (
                                      <ul className="list-disc list-inside my-1 space-y-0.5 text-zinc-400">
                                        {children}
                                      </ul>
                                    ),
                                    ol: ({ children }) => (
                                      <ol className="list-decimal list-inside my-1 space-y-0.5 text-zinc-400">
                                        {children}
                                      </ol>
                                    ),
                                    p: ({ children }) => (
                                      <p className="my-1 leading-relaxed text-zinc-400">{children}</p>
                                    ),
                                    strong: ({ children }) => (
                                      <strong className="font-semibold text-slate-300">{children}</strong>
                                    ),
                                    hr: () => (
                                      <hr className="border-zinc-700 my-2" />
                                    ),
                                  }}
                                >
                                  {item.summaryText}
                                </ReactMarkdown>
                              </div>
                            </div>
                          </details>
                        );
                      }
                      if (item.type === 'tool' && item.toolName) {
                        // Get tool icon
                        const getToolIcon = (name: string) => {
                          switch (name) {
                            case 'Bash':
                              return <Terminal size={14} />;
                            case 'Read':
                            case 'Write':
                            case 'Edit':
                              return <FileCode size={14} />;
                            case 'Grep':
                            case 'Glob':
                              return <Search size={14} />;
                            case 'AskUserQuestion':
                              return <HelpCircle size={14} />;
                            default:
                              return <Settings size={14} />;
                          }
                        };

                        // Get friendly tool name
                        const getToolLabel = (name: string) => {
                          switch (name) {
                            case 'Bash':
                              return '执行命令';
                            case 'Read':
                              return '读取文件';
                            case 'Write':
                              return '写入文件';
                            case 'Edit':
                              return '编辑文件';
                            case 'Grep':
                              return '搜索内容';
                            case 'Glob':
                              return '查找文件';
                            case 'Task':
                              return '子任务';
                            case 'TaskOutput':
                              return '获取任务输出';
                            case 'AskUserQuestion':
                              return '询问用户';
                            case 'WebSearch':
                              return '网络搜索';
                            case 'WebFetch':
                              return '获取网页';
                            default:
                              return name;
                          }
                        };

                        // Special rendering for AskUserQuestion
                        if (item.toolName === 'AskUserQuestion' && item.questions && item.questions.length > 0) {
                          return (
                            <div
                              key={i}
                              className="text-sm bg-cyan-500/10 border border-cyan-500/30 rounded-lg overflow-hidden"
                            >
                              <div className="flex items-center gap-2 px-3 py-2 bg-cyan-500/20 border-b border-cyan-500/30">
                                <HelpCircle size={14} className="text-cyan-400" />
                                <span className="text-cyan-400 font-medium">询问用户</span>
                              </div>
                              <div className="px-3 py-2 space-y-3">
                                {item.questions.map((q, qIdx) => (
                                  <div key={qIdx} className="text-xs">
                                    <div className="text-cyan-300 font-medium mb-2">
                                      {q.header && <span className="text-cyan-500">[{q.header}] </span>}
                                      {q.question}
                                    </div>
                                    <div className="pl-3 space-y-1">
                                      {q.options.map((opt, optIdx) => (
                                        <div key={optIdx} className="flex items-start gap-2">
                                          <span className="text-zinc-500">•</span>
                                          <div>
                                            <span className="text-zinc-300">{opt.label}</span>
                                            {opt.description && (
                                              <span className="text-zinc-500 ml-2">- {opt.description}</span>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={i}
                            className="text-sm bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden"
                          >
                            <div className="flex items-center gap-2 px-3 py-2 bg-zinc-700/50 border-b border-zinc-700">
                              <span className="text-blue-400">{getToolIcon(item.toolName)}</span>
                              <span className="text-blue-400 font-medium">{getToolLabel(item.toolName)}</span>
                            </div>
                            {item.toolDescription && (
                              <div className="px-3 py-2 text-xs text-zinc-400 border-b border-zinc-700">
                                {item.toolDescription}
                              </div>
                            )}
                            {item.toolCommand && (
                              <div className="px-3 py-2 font-mono text-xs text-green-400 bg-zinc-900 overflow-x-auto">
                                <code>$ {item.toolCommand}</code>
                              </div>
                            )}
                            {item.toolFilePath && !item.toolCommand && (
                              <div className="px-3 py-2 text-xs text-zinc-400 font-mono">
                                {item.toolFilePath}
                              </div>
                            )}
                          </div>
                        );
                      }
                      return null;
                    })}
                  </div>
                </div>
                {message.timestamp && (
                  <div className="text-xs text-zinc-600 mt-1">
                    {new Date(message.timestamp).toLocaleString('zh-CN')}
                  </div>
                )}
              </div>
            </div>
          );
          })}
        </div>
      </main>

      {/* Input */}
      <div className="border-t border-zinc-800 bg-zinc-900/50 backdrop-blur-sm p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="Type a message... (Claude Code integration coming soon)"
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-500/50"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="px-4 py-3 bg-amber-500 hover:bg-amber-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-black font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              <Send size={18} />
              {sending ? 'Sending...' : 'Send'}
            </button>
          </div>
          <p className="text-xs text-zinc-600 mt-2 text-center">
            Chat functionality requires the local proxy service to be running
          </p>
        </div>
      </div>
    </div>
  );
}
