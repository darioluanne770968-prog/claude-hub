'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { X, Loader2, MessageSquare, Maximize2, Minimize2, ExternalLink } from 'lucide-react';

interface SummaryDetailPopupProps {
  sessionId: string;
  summaryText: string;
  summaryTimestamp?: string; // Timestamp when this summary was generated
  projectPath: string;
  source?: {
    type: 'local' | 'remote';
    hostId?: string;
    hostName?: string;
  };
  onClose: () => void;
}

interface Message {
  type: string;
  uuid?: string;
  timestamp?: string;
  richContent: Array<{
    type: string;
    text?: string;
    toolName?: string;
    toolDescription?: string;
    toolCommand?: string;
    toolFilePath?: string;
    thinking?: string;
    commandResult?: string;
    summaryText?: string;
  }>;
}

export default function SummaryDetailPopup({
  sessionId,
  summaryText,
  summaryTimestamp,
  projectPath,
  source,
  onClose,
}: SummaryDetailPopupProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contextMessages, setContextMessages] = useState<Message[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [messageLimit, setMessageLimit] = useState(50);
  const router = useRouter();

  // Navigate to session detail page and scroll to specific message
  const navigateToMessage = (msg: Message) => {
    // Build URL with source info for remote sessions
    let url = `/session/${sessionId}`;
    const params = new URLSearchParams();

    if (source?.type === 'remote' && source.hostId) {
      params.set('hostId', source.hostId);
      params.set('projectPath', projectPath);
      if (source.hostName) {
        params.set('hostName', source.hostName);
      }
    }

    // Add scroll target - use uuid if available, otherwise timestamp
    if (msg.uuid) {
      params.set('scrollTo', msg.uuid);
    } else if (msg.timestamp) {
      params.set('scrollToTime', msg.timestamp);
    }

    const queryString = params.toString();
    if (queryString) {
      url += `?${queryString}`;
    }

    onClose();
    router.push(url);
  };

  useEffect(() => {
    async function fetchContext() {
      try {
        setLoading(true);
        setError(null);

        // Build URL with source info for remote sessions
        let url = `/api/sessions/${sessionId}`;
        if (source?.type === 'remote' && source.hostId) {
          url += `?hostId=${source.hostId}&projectPath=${encodeURIComponent(projectPath)}`;
        }

        const res = await fetch(url);
        if (!res.ok) {
          throw new Error('Failed to fetch session');
        }

        const data = await res.json();
        const messages: Message[] = data.messages || [];

        if (messages.length === 0) {
          setContextMessages([]);
          return;
        }

        // If we have a timestamp, find messages that occurred just before this summary
        // Summaries are generated after a conversation segment, so we want messages before the summary timestamp
        if (summaryTimestamp) {
          const summaryTime = new Date(summaryTimestamp).getTime();

          // Find messages that occurred before this summary
          const messagesBeforeSummary = messages.filter(msg => {
            if (!msg.timestamp) return false;
            return new Date(msg.timestamp).getTime() < summaryTime;
          });

          // Get messages before this summary (use messageLimit)
          const contextMsgs = messagesBeforeSummary.slice(-messageLimit);
          setContextMessages(contextMsgs);
        } else {
          // Fallback: just show messages from the session
          const sampled = messages.slice(0, messageLimit);
          setContextMessages(sampled);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchContext();
  }, [sessionId, summaryText, summaryTimestamp, projectPath, source, messageLimit]);

  // Extract plain text from rich content
  const getMessagePreview = (msg: Message): string => {
    const parts: string[] = [];

    for (const content of msg.richContent) {
      if (content.type === 'text' && content.text) {
        const text = content.text.slice(0, 300);
        parts.push(text + (content.text.length > 300 ? '...' : ''));
      } else if (content.type === 'tool' && content.toolName) {
        // Tool usage
        let toolInfo = `[${content.toolName}]`;
        if (content.toolDescription) {
          toolInfo = `[${content.toolName}] ${content.toolDescription}`;
        } else if (content.toolFilePath) {
          toolInfo = `[${content.toolName}] ${content.toolFilePath}`;
        } else if (content.toolCommand) {
          toolInfo = `[${content.toolName}] ${content.toolCommand.slice(0, 50)}${content.toolCommand.length > 50 ? '...' : ''}`;
        }
        parts.push(toolInfo);
      } else if (content.type === 'thinking' && content.thinking) {
        parts.push(`[思考] ${content.thinking.slice(0, 100)}...`);
      } else if (content.type === 'command-result' && content.commandResult) {
        parts.push(`[命令结果] ${content.commandResult.slice(0, 100)}...`);
      } else if (content.type === 'context-summary' && content.summaryText) {
        parts.push(`[摘要] ${content.summaryText}`);
      }
    }

    if (parts.length === 0) {
      return '[无文本内容]';
    }

    // Return first meaningful part (prioritize text over tool calls)
    return parts[0];
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className={`bg-white dark:bg-zinc-900 rounded-lg shadow-xl overflow-hidden transition-all duration-300 ${
          expanded
            ? 'max-w-6xl w-full mx-4 max-h-[95vh]'
            : 'max-w-2xl w-full mx-4 max-h-[80vh]'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <h3 className="font-medium text-zinc-900 dark:text-white">摘要详情</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setExpanded(!expanded);
                setMessageLimit(expanded ? 50 : 200);
              }}
              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
              title={expanded ? "收起" : "放大"}
            >
              {expanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Summary */}
        <div className="px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border-b border-zinc-200 dark:border-zinc-800">
          <p className="text-zinc-800 dark:text-zinc-200 font-medium">
            {summaryText}
          </p>
        </div>

        {/* Context Messages */}
        <div className={`p-4 overflow-y-auto ${expanded ? 'max-h-[75vh]' : 'max-h-[50vh]'}`}>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="animate-spin text-zinc-400" size={24} />
              <span className="ml-2 text-zinc-500">加载上下文消息...</span>
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-500">
              加载失败: {error}
            </div>
          ) : contextMessages.length === 0 ? (
            <div className="text-center py-8 text-zinc-500">
              没有找到相关消息
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm text-zinc-500 mb-3">
                <div className="flex items-center gap-2">
                  <MessageSquare size={14} />
                  <span>相关消息预览 ({contextMessages.length} 条)</span>
                </div>
                {!expanded && contextMessages.length >= 50 && (
                  <button
                    onClick={() => {
                      setExpanded(true);
                      setMessageLimit(200);
                    }}
                    className="text-xs text-amber-500 hover:text-amber-600 dark:hover:text-amber-400"
                  >
                    查看更多消息
                  </button>
                )}
              </div>
              {contextMessages.map((msg, i) => (
                <div
                  key={i}
                  onClick={() => navigateToMessage(msg)}
                  className={`p-3 rounded-lg text-sm cursor-pointer group transition-all hover:shadow-md ${
                    msg.type === 'user'
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30'
                      : 'bg-zinc-100 dark:bg-zinc-800 border-l-2 border-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
                    <div>
                      {msg.type === 'user' ? '用户' : 'Claude'}
                      {msg.timestamp && (
                        <span className="ml-2">
                          {new Date(msg.timestamp).toLocaleString('zh-CN')}
                        </span>
                      )}
                    </div>
                    <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 transition-opacity text-amber-500" />
                  </div>
                  <p className="text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
                    {getMessagePreview(msg)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>
              {expanded ? '放大模式 - 最多显示200条' : '普通模式 - 最多显示50条'}
            </span>
            <span className="text-amber-500">点击消息跳转到对应位置</span>
          </div>
        </div>
      </div>
    </div>
  );
}
