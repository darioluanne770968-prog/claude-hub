'use client';

import { useEffect, useState, use, useRef, useCallback, memo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
  Check,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  HelpCircle,
  MessageSquare,
  FileText,
  Download,
  Server,
  FileDown,
  Code,
  X,
  Coins,
  FolderTree,
  Copy,
  Sparkles,
  Trash2,
  MousePointer2,
  CheckSquare,
} from 'lucide-react';
import Link from 'next/link';
import TerminalButton from '@/components/TerminalButton';
import SessionSearch from '@/components/SessionSearch';
import ThemeToggle from '@/components/ThemeToggle';
import CodeSnippets from '@/components/CodeSnippets';
import TagManager from '@/components/TagManager';
import TokenStats from '@/components/TokenStats';
import SessionActions from '@/components/SessionActions';
import FileChanges from '@/components/FileChanges';
import Tooltip from '@/components/Tooltip';

// Helper function to highlight search matches in text
function HighlightText({ text, searchQuery, isCurrentMatch }: { text: string; searchQuery: string; isCurrentMatch?: boolean }) {
  if (!searchQuery.trim()) {
    return <>{text}</>;
  }

  const parts = text.split(new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));

  return (
    <>
      {parts.map((part, i) => {
        const isMatch = part.toLowerCase() === searchQuery.toLowerCase();
        if (isMatch) {
          return (
            <mark
              key={i}
              className={`px-0.5 rounded ${isCurrentMatch ? 'bg-amber-400 dark:bg-amber-500' : 'bg-yellow-200 dark:bg-yellow-600'}`}
            >
              {part}
            </mark>
          );
        }
        return part;
      })}
    </>
  );
}

interface SearchMatch {
  messageIndex: number;
  contentIndex: number;
  text: string;
}

// Separate input component to prevent re-renders of the entire message list
const ChatInput = memo(function ChatInput({
  onSend,
  sending,
}: {
  onSend: (message: string) => void;
  sending: boolean;
}) {
  const [input, setInput] = useState('');

  const handleSend = () => {
    if (!input.trim() || sending) return;
    onSend(input);
    setInput('');
  };

  return (
    <div className="border-t border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="输入消息继续对话..."
            className="flex-1 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg px-4 py-3 text-zinc-900 dark:text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-500/50"
            disabled={sending}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="px-4 py-3 bg-amber-500 hover:bg-amber-600 disabled:bg-zinc-200 dark:disabled:bg-zinc-700 disabled:text-zinc-400 dark:disabled:text-zinc-500 text-black font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            <Send size={18} />
            {sending ? '发送中...' : '发送'}
          </button>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-600 mt-2 text-center">
          使用 Claude Code CLI 继续对话 • 响应可能需要几秒到几分钟
        </p>
      </div>
    </div>
  );
});

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

interface RemoteSource {
  type: 'remote';
  hostId: string;
  hostName: string;
}

interface SessionDetail {
  id: string;
  provider?: 'claude' | 'codex';
  projectPath: string;
  projectName: string;
  summaries: string[];
  customName?: string;
  lastModified: string;
  messages: Message[];
  source?: RemoteSource;
}

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const hostId = searchParams.get('hostId');
  const projectPath = searchParams.get('projectPath');
  const scrollToId = searchParams.get('scrollTo');
  const scrollToTime = searchParams.get('scrollToTime');
  const isRemote = !!hostId;

  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatches, setSearchMatches] = useState<SearchMatch[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [expandedThinking, setExpandedThinking] = useState<Set<string>>(new Set());
  const [copying, setCopying] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [copyingForClaude, setCopyingForClaude] = useState(false);
  const [copyForClaudeSuccess, setCopyForClaudeSuccess] = useState(false);
  const [showCodeSnippets, setShowCodeSnippets] = useState(false);
  const [showTokenStats, setShowTokenStats] = useState(false);
  const [showFileChanges, setShowFileChanges] = useState(false);
  const [showSessionActions, setShowSessionActions] = useState(false);
  const [renameSuccess, setRenameSuccess] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [scrollPercentage, setScrollPercentage] = useState(0);
  const isCodexSession = !isRemote && session?.provider === 'codex';
  // Selection mode for partial export
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);
  const [exportingSelection, setExportingSelection] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const messageRefs = useRef<Map<string, HTMLElement>>(new Map());

  // Find the scrollable container
  const getScrollContainer = useCallback(() => {
    // Try multiple possible scroll containers
    const mainEl = document.getElementById('session-main');
    if (mainEl && mainEl.scrollHeight > mainEl.clientHeight) {
      return mainEl;
    }
    // Fallback to document scrolling element
    return document.scrollingElement || document.documentElement;
  }, []);

  // Scroll navigation functions
  const handleMainScroll = useCallback(() => {
    const scrollEl = getScrollContainer();
    if (scrollEl) {
      const { scrollTop, scrollHeight, clientHeight } = scrollEl;
      const maxScroll = scrollHeight - clientHeight;
      const percentage = maxScroll > 0 ? scrollTop / maxScroll : 0;
      setScrollPercentage(percentage);
    }
  }, [getScrollContainer]);

  const scrollToPosition = useCallback((percentage: number) => {
    const scrollEl = getScrollContainer();
    if (scrollEl) {
      const { scrollHeight, clientHeight } = scrollEl;
      const maxScroll = scrollHeight - clientHeight;
      scrollEl.scrollTo({ top: percentage * maxScroll, behavior: 'smooth' });
    }
  }, [getScrollContainer]);

  const scrollToTop = useCallback(() => {
    const scrollEl = getScrollContainer();
    scrollEl?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [getScrollContainer]);

  const scrollToBottom = useCallback(() => {
    const scrollEl = getScrollContainer();
    if (scrollEl) {
      scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: 'smooth' });
    }
  }, [getScrollContainer]);

  // Get remote source from search params if available
  const remoteSource: RemoteSource | undefined = hostId ? {
    type: 'remote',
    hostId,
    hostName: searchParams.get('hostName') || 'Remote',
  } : undefined;

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (sending && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [session?.messages, sending]);

  // Attach scroll listener to window as well (for Electron)
  useEffect(() => {
    const handleWindowScroll = () => handleMainScroll();
    window.addEventListener('scroll', handleWindowScroll, true);
    return () => window.removeEventListener('scroll', handleWindowScroll, true);
  }, [handleMainScroll]);

  useEffect(() => {
    const fetchSession = async () => {
      setLoading(true);
      try {
        // Build URL with query params for remote sessions
        let url = `/api/sessions/${id}`;
        if (hostId && projectPath) {
          url += `?hostId=${hostId}&projectPath=${encodeURIComponent(projectPath)}`;
        }
        const res = await fetch(url);
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
  }, [id, hostId, projectPath]);

  // Scroll to specific message when scrollTo param is present
  useEffect(() => {
    if (!session || loading) return;

    // Find the target message
    let targetIndex = -1;

    if (scrollToId) {
      // Find by UUID
      targetIndex = session.messages.findIndex(msg => msg.uuid === scrollToId);
    } else if (scrollToTime) {
      // Find by timestamp (closest match)
      const targetTime = new Date(scrollToTime).getTime();
      let minDiff = Infinity;
      session.messages.forEach((msg, idx) => {
        if (msg.timestamp) {
          const msgTime = new Date(msg.timestamp).getTime();
          const diff = Math.abs(msgTime - targetTime);
          if (diff < minDiff) {
            minDiff = diff;
            targetIndex = idx;
          }
        }
      });
    }

    if (targetIndex >= 0) {
      // Wait for DOM to be ready
      setTimeout(() => {
        const targetMessage = session.messages[targetIndex];
        const element = document.querySelector(`[data-message-uuid="${targetMessage.uuid}"]`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Add highlight effect
          element.classList.add('ring-2', 'ring-amber-500', 'ring-offset-2');
          setTimeout(() => {
            element.classList.remove('ring-2', 'ring-amber-500', 'ring-offset-2');
          }, 3000);
        }
      }, 500);
    }
  }, [session, loading, scrollToId, scrollToTime]);

  const handleSend = useCallback(async (userMessage: string) => {
    if (!userMessage.trim() || sending || !session || isRemote || session.provider === 'codex') return;

    setSending(true);

    // Add user message immediately
    const userMsgId = Date.now().toString();
    const assistantMsgId = (Date.now() + 1).toString();

    setSession({
      ...session,
      messages: [
        ...session.messages,
        {
          type: 'user',
          uuid: userMsgId,
          timestamp: new Date().toISOString(),
          richContent: [{ type: 'text', text: userMessage }],
          role: 'user',
        },
        {
          type: 'assistant',
          uuid: assistantMsgId,
          timestamp: new Date().toISOString(),
          richContent: [{ type: 'text', text: '⏳ 正在启动 Claude...' }],
          role: 'assistant',
        },
      ],
    });

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          sessionId: id,
          projectPath: session?.projectPath,
        }),
      });

      if (res.ok && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));

                if (data.type === 'thinking') {
                  // Show thinking process in collapsible section
                  setSession(prev => {
                    if (!prev) return prev;
                    const newMessages = [...prev.messages];
                    const lastMsg = newMessages[newMessages.length - 1];
                    if (lastMsg && lastMsg.uuid === assistantMsgId) {
                      // Find or create thinking content item
                      const thinkingIndex = lastMsg.richContent.findIndex(item => item.type === 'thinking');
                      if (thinkingIndex >= 0) {
                        lastMsg.richContent[thinkingIndex] = { type: 'thinking', thinking: data.text };
                      } else {
                        // Insert thinking at the beginning, before any text
                        lastMsg.richContent.unshift({ type: 'thinking', thinking: data.text });
                      }
                    }
                    return { ...prev, messages: newMessages };
                  });
                } else if (data.type === 'content') {
                  // API sends complete text, so replace/update
                  setSession(prev => {
                    if (!prev) return prev;
                    const newMessages = [...prev.messages];
                    const lastMsg = newMessages[newMessages.length - 1];
                    if (lastMsg && lastMsg.uuid === assistantMsgId) {
                      // Find or create text content item (not thinking)
                      const textIndex = lastMsg.richContent.findIndex(item => item.type === 'text');
                      if (textIndex >= 0) {
                        lastMsg.richContent[textIndex] = { type: 'text', text: data.text };
                      } else {
                        lastMsg.richContent.push({ type: 'text', text: data.text });
                      }
                      // Remove loading state if present
                      lastMsg.richContent = lastMsg.richContent.filter(item =>
                        !(item.type === 'text' && item.text?.startsWith('⏳'))
                      );
                    }
                    return { ...prev, messages: newMessages };
                  });
                } else if (data.type === 'status') {
                  // Update with status message (e.g., "已连接到 Claude", "正在思考中")
                  setSession(prev => {
                    if (!prev) return prev;
                    const newMessages = [...prev.messages];
                    const lastMsg = newMessages[newMessages.length - 1];
                    if (lastMsg && lastMsg.uuid === assistantMsgId) {
                      // Only update if we haven't received content yet
                      const hasContent = lastMsg.richContent.some(item =>
                        item.type === 'text' && item.text && !item.text.startsWith('⏳')
                      );
                      if (!hasContent) {
                        // Update or add loading status
                        const loadingIndex = lastMsg.richContent.findIndex(item =>
                          item.type === 'text' && item.text?.startsWith('⏳')
                        );
                        if (loadingIndex >= 0) {
                          lastMsg.richContent[loadingIndex] = { type: 'text', text: `⏳ ${data.text}...` };
                        } else {
                          lastMsg.richContent.push({ type: 'text', text: `⏳ ${data.text}...` });
                        }
                      }
                    }
                    return { ...prev, messages: newMessages };
                  });
                } else if (data.type === 'error') {
                  setSession(prev => {
                    if (!prev) return prev;
                    const newMessages = [...prev.messages];
                    const lastMsg = newMessages[newMessages.length - 1];
                    if (lastMsg && lastMsg.uuid === assistantMsgId) {
                      lastMsg.richContent = [{ type: 'text', text: `❌ ${data.text}` }];
                    }
                    return { ...prev, messages: newMessages };
                  });
                }
              } catch (e) {
                // Ignore JSON parse errors for incomplete chunks
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      // Update with error message
      setSession(prev => {
        if (!prev) return prev;
        const newMessages = [...prev.messages];
        const lastMsg = newMessages[newMessages.length - 1];
        if (lastMsg && lastMsg.uuid === assistantMsgId) {
          lastMsg.richContent = [{ type: 'text', text: '发送失败，请重试。' }];
        }
        return { ...prev, messages: newMessages };
      });
    } finally {
      setSending(false);
    }
  }, [sending, session, id, isRemote]);

  // Search functionality
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    setCurrentMatchIndex(0);

    if (!query.trim() || !session) {
      setSearchMatches([]);
      return;
    }

    const matches: SearchMatch[] = [];
    const queryLower = query.toLowerCase();

    session.messages.forEach((message, messageIndex) => {
      message.richContent.forEach((item, contentIndex) => {
        let textToSearch = '';

        if (item.type === 'text' && item.text) {
          textToSearch = item.text;
        } else if (item.type === 'thinking' && item.thinking) {
          textToSearch = item.thinking;
        } else if (item.type === 'command-result' && item.commandResult) {
          textToSearch = item.commandResult;
        } else if (item.type === 'tool' && item.toolCommand) {
          textToSearch = item.toolCommand;
        } else if (item.type === 'context-summary' && item.summaryText) {
          textToSearch = item.summaryText;
        }

        if (textToSearch.toLowerCase().includes(queryLower)) {
          matches.push({ messageIndex, contentIndex, text: textToSearch });
        }
      });
    });

    setSearchMatches(matches);
  }, [session]);

  const scrollToMatch = useCallback((matchIndex: number) => {
    if (matchIndex < 0 || matchIndex >= searchMatches.length) return;

    const match = searchMatches[matchIndex];
    const messageKey = `${match.messageIndex}-${match.contentIndex}`;
    const element = messageRefs.current.get(messageKey);

    if (element) {
      // If it's a thinking block, expand it first
      const message = session?.messages[match.messageIndex];
      const item = message?.richContent[match.contentIndex];
      if (item?.type === 'thinking' || item?.type === 'context-summary') {
        setExpandedThinking(prev => new Set([...prev, messageKey]));
      }

      // Scroll to element
      setTimeout(() => {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [searchMatches, session]);

  const handlePrevMatch = useCallback(() => {
    const newIndex = currentMatchIndex > 0 ? currentMatchIndex - 1 : searchMatches.length - 1;
    setCurrentMatchIndex(newIndex);
    scrollToMatch(newIndex);
  }, [currentMatchIndex, searchMatches.length, scrollToMatch]);

  const handleNextMatch = useCallback(() => {
    const newIndex = currentMatchIndex < searchMatches.length - 1 ? currentMatchIndex + 1 : 0;
    setCurrentMatchIndex(newIndex);
    scrollToMatch(newIndex);
  }, [currentMatchIndex, searchMatches.length, scrollToMatch]);

  const handleSearchClose = useCallback(() => {
    setSearchQuery('');
    setSearchMatches([]);
    setCurrentMatchIndex(0);
  }, []);

  // Handle copying remote session to local
  const handleCopyToLocal = useCallback(async () => {
    if (!isRemote || !session || copying) return;

    setCopying(true);
    setCopySuccess(false);

    try {
      const res = await fetch('/api/sessions/copy-to-local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: id,
          projectPath: session.projectPath,
          hostId,
        }),
      });

      if (res.ok) {
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 3000);
      } else {
        const data = await res.json();
        alert(`复制失败: ${data.error || '未知错误'}`);
      }
    } catch (error) {
      console.error('Failed to copy session to local:', error);
      alert('复制失败，请重试');
    } finally {
      setCopying(false);
    }
  }, [isRemote, session, copying, id, hostId]);

  // Copy session summary for VS Code Claude
  const handleCopyForClaude = useCallback(async () => {
    if (copyingForClaude) return;

    setCopyingForClaude(true);
    setCopyForClaudeSuccess(false);

    try {
      const res = await fetch(`/api/sessions/${id}/summary-for-claude`);
      if (res.ok) {
        const data = await res.json();
        await navigator.clipboard.writeText(data.summary);
        setCopyForClaudeSuccess(true);
        // Show success message with AI indicator
        const aiMsg = data.usedAI ? ' (AI 智能总结)' : '';
        console.log(`摘要已复制${aiMsg}，统计: ${data.stats.userMessages} 条消息, ${data.stats.filesModified} 个文件`);
        setTimeout(() => setCopyForClaudeSuccess(false), 3000);
      } else {
        const errorData = await res.json();
        alert(`生成摘要失败: ${errorData.error || '未知错误'}`);
      }
    } catch (error) {
      console.error('Failed to copy summary:', error);
      alert('复制失败，请重试');
    } finally {
      setCopyingForClaude(false);
    }
  }, [copyingForClaude, id]);

  // Handle session deletion
  const handleDeleteSession = useCallback(async () => {
    if (deleting) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
      if (res.ok) {
        // Navigate back to home after successful deletion
        router.push('/');
      } else {
        alert('删除失败，请重试');
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
      alert('删除失败，请重试');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }, [deleting, id, router]);

  // Selection mode handlers
  const handleMessageClick = useCallback((messageIndex: number) => {
    if (!selectionMode) return;

    if (selectionStart === null) {
      // First click - set start
      setSelectionStart(messageIndex);
      setSelectionEnd(null);
    } else if (selectionEnd === null) {
      // Second click - set end
      if (messageIndex === selectionStart) {
        // Clicking same message - just select that one
        setSelectionEnd(messageIndex);
      } else if (messageIndex < selectionStart) {
        // Clicked before start - swap
        setSelectionEnd(selectionStart);
        setSelectionStart(messageIndex);
      } else {
        setSelectionEnd(messageIndex);
      }
    } else {
      // Reset and start new selection
      setSelectionStart(messageIndex);
      setSelectionEnd(null);
    }
  }, [selectionMode, selectionStart, selectionEnd]);

  const isMessageSelected = useCallback((messageIndex: number) => {
    if (selectionStart === null) return false;
    if (selectionEnd === null) return messageIndex === selectionStart;
    return messageIndex >= selectionStart && messageIndex <= selectionEnd;
  }, [selectionStart, selectionEnd]);

  const getSelectedCount = useCallback(() => {
    if (selectionStart === null) return 0;
    if (selectionEnd === null) return 1;
    return selectionEnd - selectionStart + 1;
  }, [selectionStart, selectionEnd]);

  const clearSelection = useCallback(() => {
    setSelectionStart(null);
    setSelectionEnd(null);
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    clearSelection();
  }, [clearSelection]);

  // Export selected messages as Markdown
  const exportSelectedMessages = useCallback(async () => {
    if (!session || selectionStart === null) return;

    setExportingSelection(true);
    try {
      const endIdx = selectionEnd ?? selectionStart;
      const selectedMessages = session.messages.slice(selectionStart, endIdx + 1);

      // Convert messages to clean Markdown - focus on readable content
      let markdown = `# ${session.customName || session.summaries[0] || '会话片段'}\n\n`;
      markdown += `> **项目**: \`${session.projectPath}\`  \n`;
      markdown += `> **导出时间**: ${new Date().toLocaleString('zh-CN')}  \n`;
      markdown += `> **消息数量**: ${endIdx - selectionStart + 1} 条\n\n`;

      for (const msg of selectedMessages) {
        const isUser = msg.role === 'user';
        const time = msg.timestamp ? new Date(msg.timestamp).toLocaleString('zh-CN') : '';

        // User messages: blockquote style
        // Claude messages: normal text
        if (isUser) {
          markdown += `---\n\n`;
          markdown += `### 💬 用户${time ? ` · ${time}` : ''}\n\n`;
        } else {
          markdown += `---\n\n`;
          markdown += `### 🤖 Claude${time ? ` · ${time}` : ''}\n\n`;
        }

        for (const content of msg.richContent) {
          if (content.type === 'text' && content.text) {
            // Clean up the text - preserve original formatting
            markdown += `${content.text}\n\n`;
          } else if (content.type === 'image' && content.imageData) {
            // Embed image as base64 in markdown
            markdown += `![图片](${content.imageData})\n\n`;
          } else if (content.type === 'thinking' && content.thinking) {
            // Thinking in collapsible section
            markdown += `<details>\n<summary>💭 <em>思考过程</em></summary>\n\n${content.thinking}\n\n</details>\n\n`;
          } else if (content.type === 'tool' && content.toolName) {
            // Tool usage - compact format
            let toolInfo = `> 🔧 **${content.toolName}**`;
            if (content.toolDescription) toolInfo += ` - ${content.toolDescription}`;
            if (content.toolFilePath) toolInfo += `\n> 📄 \`${content.toolFilePath}\``;
            if (content.toolCommand) toolInfo += `\n> \`\`\`\n> ${content.toolCommand}\n> \`\`\``;
            markdown += `${toolInfo}\n\n`;
          } else if (content.type === 'command-result' && content.commandResult) {
            // Command results - collapsible if long
            const resultText = content.commandResult;
            if (resultText.length > 500) {
              markdown += `<details>\n<summary>📋 执行结果 (${resultText.length} 字符)</summary>\n\n\`\`\`\n${resultText}\n\`\`\`\n\n</details>\n\n`;
            } else {
              markdown += `\`\`\`\n${resultText}\n\`\`\`\n\n`;
            }
          }
        }
      }

      markdown += `---\n\n*导出自 Claude Hub*\n`;

      // Download as file
      const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const sessionName = (session.customName || session.projectName || 'session').replace(/[/\\?%*:|"<>]/g, '-');
      const filename = `${sessionName}_${new Date().toISOString().slice(0, 10)}.md`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Exit selection mode after export
      exitSelectionMode();
    } catch (error) {
      console.error('Failed to export selection:', error);
      alert('导出失败，请重试');
    } finally {
      setExportingSelection(false);
    }
  }, [session, selectionStart, selectionEnd, exitSelectionMode]);

  // Check if a content item is the current match
  const isCurrentMatch = useCallback((messageIndex: number, contentIndex: number) => {
    if (searchMatches.length === 0) return false;
    const current = searchMatches[currentMatchIndex];
    return current?.messageIndex === messageIndex && current?.contentIndex === contentIndex;
  }, [searchMatches, currentMatchIndex]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-100 dark:bg-zinc-950 flex items-center justify-center">
        <RefreshCw size={24} className="animate-spin text-zinc-500" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-zinc-100 dark:bg-zinc-950 flex flex-col items-center justify-center gap-4">
        <p className="text-zinc-500">Session not found</p>
        <Link href="/" className="text-amber-500 hover:underline">
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-zinc-950 flex flex-col">
      {/* Global Success Toast */}
      {renameSuccess && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg shadow-lg">
            <Check size={16} />
            <span className="text-sm font-medium">{renameSuccess}</span>
          </div>
        </div>
      )}

      {/* Header - draggable for Electron */}
      <header className="electron-drag border-b border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 electron-titlebar-padding">
          {/* Row 1: Title and basic info */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="electron-no-drag p-2 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors flex-shrink-0"
            >
              <ArrowLeft size={20} />
            </button>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="font-medium text-zinc-900 dark:text-white truncate">
                  {session.customName || session.summaries[0] || 'Session ' + session.id.slice(0, 8)}
                </h1>
                {session.provider === 'codex' && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs whitespace-nowrap flex-shrink-0">
                    <Code size={12} />
                    Codex
                  </span>
                )}
                {isRemote && remoteSource && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 text-xs whitespace-nowrap flex-shrink-0">
                    <Server size={12} />
                    {remoteSource.hostName}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-sm text-zinc-500 mt-0.5">
                <span className="flex items-center gap-1 font-mono text-xs" title={session.projectPath}>
                  <FolderOpen size={14} />
                  {session.projectPath}
                </span>
                <span className="flex items-center gap-1">
                  <Clock size={14} />
                  {formatDistanceToNow(new Date(session.lastModified), {
                    addSuffix: true,
                    locale: zhCN,
                  })}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1 flex-shrink-0 electron-no-drag">
              <Tooltip content="收藏此会话">
                <SessionActions sessionId={session.id} compact />
              </Tooltip>
              <Tooltip content="切换深色/浅色主题">
                <ThemeToggle />
              </Tooltip>
            </div>
          </div>

          {/* Row 2: Action buttons */}
          <div className="flex items-center gap-2 mt-3 flex-wrap electron-no-drag">
            <TagManager sessionId={session.id} />

            {/* Selection mode button - prominent position */}
            <Tooltip content={selectionMode ? '退出选择模式' : '选择导出 - 选择部分消息导出为 Markdown'}>
              <button
                onClick={() => selectionMode ? exitSelectionMode() : setSelectionMode(true)}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  selectionMode
                    ? 'bg-amber-500 text-black font-medium ring-2 ring-amber-300'
                    : 'bg-green-500/20 text-green-600 dark:text-green-400 hover:bg-green-500/30 border border-green-500/30'
                }`}
              >
                <MousePointer2 size={16} />
                <span className="text-xs font-medium">{selectionMode ? '选择中...' : '选择导出'}</span>
              </button>
            </Tooltip>

            <div className="flex items-center gap-1 ml-auto">
              <Tooltip content="搜索会话内容">
                <SessionSearch
                  onSearch={handleSearch}
                  matchCount={searchMatches.length}
                  currentMatch={currentMatchIndex}
                  onPrevMatch={handlePrevMatch}
                  onNextMatch={handleNextMatch}
                  onClose={handleSearchClose}
                />
              </Tooltip>

              {/* Copy to Local button for remote sessions */}
              {isRemote && (
                <Tooltip content={copying ? '复制中...' : copySuccess ? '已复制到本地' : '复制到本地 - 下载会话以便在本地继续'}>
                  <button
                    onClick={handleCopyToLocal}
                    disabled={copying}
                    className={`p-2 rounded-lg transition-all ${copySuccess
                      ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                      : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20'
                      } disabled:opacity-50`}
                  >
                    {copySuccess ? <CheckCircle size={18} /> : <Download size={18} />}
                  </button>
                </Tooltip>
              )}

              <Tooltip content="会话操作 - 收藏、归档、重命名、添加笔记">
                <button
                  onClick={() => setShowSessionActions(true)}
                  className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                >
                  <Settings size={18} />
                </button>
              </Tooltip>

              <Tooltip content="Token 统计 - 查看消耗和费用估算">
                <button
                  onClick={() => setShowTokenStats(true)}
                  className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                >
                  <Coins size={18} />
                </button>
              </Tooltip>

              <Tooltip content="文件变更 - 查看读取和修改的文件">
                <button
                  onClick={() => setShowFileChanges(true)}
                  className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                >
                  <FolderTree size={18} />
                </button>
              </Tooltip>

              <Tooltip content="代码片段 - 提取会话中的代码块">
                <button
                  onClick={() => setShowCodeSnippets(true)}
                  className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                >
                  <Code size={18} />
                </button>
              </Tooltip>

              {/* Copy for VS Code Claude button */}
              <Tooltip content={copyingForClaude ? 'AI 生成摘要中...' : copyForClaudeSuccess ? '已复制到剪贴板！' : '复制给 Claude - AI 智能总结会话，粘贴到 VS Code Claude 继续工作'}>
                <button
                  onClick={handleCopyForClaude}
                  disabled={copyingForClaude}
                  className={`p-2 rounded-lg transition-all flex items-center gap-1 ${copyForClaudeSuccess
                    ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                    : 'bg-gradient-to-r from-purple-500/10 to-amber-500/10 text-purple-600 dark:text-purple-400 hover:from-purple-500/20 hover:to-amber-500/20'
                    } disabled:opacity-50`}
                >
                  {copyForClaudeSuccess ? (
                    <CheckCircle size={18} />
                  ) : copyingForClaude ? (
                    <RefreshCw size={18} className="animate-spin" />
                  ) : (
                    <>
                      <Sparkles size={18} />
                      <span className="text-xs font-medium hidden sm:inline">复制给 Claude</span>
                    </>
                  )}
                </button>
              </Tooltip>

              {/* Export dropdown */}
              <div className="relative group">
                <Tooltip content="导出会话 - Markdown/JSON/CSV">
                  <button className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">
                    <FileDown size={18} />
                  </button>
                </Tooltip>
                <div className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20">
                  <a
                    href={`/api/sessions/${session.id}/export`}
                    download
                    className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-t-lg"
                  >
                    <FileText size={14} />
                    Markdown
                  </a>
                  <a
                    href={`/api/sessions/${session.id}/export-data?format=json&download=true`}
                    download
                    className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                  >
                    <Code size={14} />
                    JSON
                  </a>
                  <a
                    href={`/api/sessions/${session.id}/export-data?format=csv`}
                    download
                    className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-b-lg"
                  >
                    <FileDown size={14} />
                    CSV
                  </a>
                </div>
              </div>

              {!isCodexSession && (
                <Tooltip content="在终端中恢复 - 使用 Claude Code CLI 继续会话">
                  <TerminalButton
                    sessionId={session.id}
                    projectPath={session.projectPath}
                    variant="icon"
                    source={remoteSource}
                  />
                </Tooltip>
              )}

              <Tooltip content="删除会话">
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 size={18} />
                </button>
              </Tooltip>
            </div>
          </div>
        </div>
      </header>

      {/* Messages */}
      <main id="session-main" className="flex-1 overflow-y-auto" onScroll={handleMainScroll}>
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
          {session.messages.map((message, messageIndex) => {
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

            const isSelected = isMessageSelected(messageIndex);
            const isSelectionBoundary = selectionStart === messageIndex || selectionEnd === messageIndex;

            return (
              <div
                key={message.uuid || messageIndex}
                data-message-uuid={message.uuid}
                onClick={() => handleMessageClick(messageIndex)}
                className={`flex gap-3 transition-all duration-300 ${isUserMessage ? 'flex-row-reverse' : ''} ${
                  selectionMode ? 'cursor-pointer' : ''
                } ${isSelected ? 'relative' : ''}`}
              >
                {/* Selection indicator */}
                {isSelected && (
                  <div className={`absolute -left-4 top-0 bottom-0 w-1 rounded-full ${
                    isSelectionBoundary ? 'bg-amber-500' : 'bg-amber-500/50'
                  }`} />
                )}
                {/* Selection checkbox */}
                {selectionMode && (
                  <div className={`flex-shrink-0 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${
                    isSelected
                      ? 'bg-amber-500 border-amber-500 text-white'
                      : 'border-zinc-300 dark:border-zinc-600 hover:border-amber-400'
                  }`}>
                    {isSelected && <Check size={14} />}
                  </div>
                )}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isUserMessage
                    ? 'bg-amber-500/20 text-amber-500'
                    : 'bg-blue-500/20 text-blue-500'
                    }`}
                >
                  {isUserMessage ? <User size={16} /> : <Bot size={16} />}
                </div>

                <div
                  className={`flex-1 max-w-[85%] ${isUserMessage ? 'text-right' : ''
                    }`}
                >
                  <div
                    className={`inline-block rounded-lg px-4 py-3 transition-all ${isUserMessage
                      ? 'bg-amber-500/10 border border-amber-500/20 text-zinc-900 dark:text-white'
                      : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 shadow-sm dark:shadow-none'
                      } ${isSelected ? 'ring-2 ring-amber-500 ring-offset-2 ring-offset-zinc-100 dark:ring-offset-zinc-950' : ''
                      } ${selectionMode && !isSelected ? 'hover:ring-2 hover:ring-amber-300 hover:ring-offset-2 hover:ring-offset-zinc-100 dark:hover:ring-offset-zinc-950' : ''}`}
                  >
                    <div className="space-y-2">
                      {message.richContent.map((item, i) => {
                        if (item.type === 'text' && item.text) {
                          // Check if this is a loading state
                          const isLoading = item.text.startsWith('⏳');
                          if (isLoading) {
                            return (
                              <div key={i} className="text-sm flex items-center gap-2 text-zinc-400">
                                <div className="flex gap-1">
                                  <span className="w-2 h-2 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                                  <span className="w-2 h-2 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                                  <span className="w-2 h-2 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                                </div>
                                <span>{item.text.replace('⏳ ', '')}</span>
                              </div>
                            );
                          }
                          return (
                            <div key={i} className="text-sm markdown-content prose prose-zinc dark:prose-invert prose-sm max-w-none">
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                  // 自定义链接样式
                                  a: ({ href, children }) => (
                                    <a href={href} target="_blank" rel="noopener noreferrer" className="text-amber-600 dark:text-amber-400 hover:text-amber-500 dark:hover:text-amber-300 underline">
                                      {children}
                                    </a>
                                  ),
                                  // 代码块样式
                                  code: ({ className, children, ...props }) => {
                                    const isInline = !className;
                                    return isInline ? (
                                      <code className="bg-zinc-200 dark:bg-zinc-700 px-1.5 py-0.5 rounded text-rose-600 dark:text-amber-300 text-xs font-medium" {...props}>
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
                                    <pre className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 p-3 rounded-lg overflow-x-auto my-2 text-zinc-800 dark:text-zinc-200">
                                      {children}
                                    </pre>
                                  ),
                                  // 表格样式
                                  table: ({ children }) => (
                                    <div className="overflow-x-auto my-2">
                                      <table className="min-w-full border-collapse border border-zinc-300 dark:border-zinc-700">
                                        {children}
                                      </table>
                                    </div>
                                  ),
                                  th: ({ children }) => (
                                    <th className="border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 text-left text-xs font-medium">
                                      {children}
                                    </th>
                                  ),
                                  td: ({ children }) => (
                                    <td className="border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs">
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
                                    <li className="text-zinc-700 dark:text-zinc-300">
                                      {children}
                                    </li>
                                  ),
                                  // 标题样式
                                  h1: ({ children }) => (
                                    <h1 className="text-lg font-bold text-zinc-900 dark:text-white mt-3 mb-2">{children}</h1>
                                  ),
                                  h2: ({ children }) => (
                                    <h2 className="text-base font-bold text-zinc-900 dark:text-white mt-3 mb-1.5">{children}</h2>
                                  ),
                                  h3: ({ children }) => (
                                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-white mt-2 mb-1">{children}</h3>
                                  ),
                                  // 分割线
                                  hr: () => (
                                    <hr className="border-zinc-300 dark:border-zinc-700 my-3" />
                                  ),
                                  // 段落
                                  p: ({ children }) => (
                                    <p className="my-1 leading-relaxed text-zinc-700 dark:text-zinc-300">{children}</p>
                                  ),
                                  // 加粗
                                  strong: ({ children }) => (
                                    <strong className="font-semibold text-zinc-900 dark:text-white">{children}</strong>
                                  ),
                                  // 引用
                                  blockquote: ({ children }) => (
                                    <blockquote className="border-l-2 border-zinc-400 dark:border-zinc-600 pl-3 my-2 text-zinc-500 dark:text-zinc-400 italic">
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
                          const thinkingKey = `${messageIndex}-${i}`;
                          const isExpanded = expandedThinking.has(thinkingKey);
                          const hasMatch = !!searchQuery && item.thinking.toLowerCase().includes(searchQuery.toLowerCase());
                          return (
                            <details
                              key={i}
                              open={isExpanded || hasMatch}
                              ref={(el) => { if (el) messageRefs.current.set(thinkingKey, el); }}
                              className={`text-sm bg-purple-100 dark:bg-purple-500/10 border rounded-lg overflow-hidden ${isCurrentMatch(messageIndex, i)
                                ? 'border-amber-500 ring-2 ring-amber-500/50'
                                : 'border-purple-300 dark:border-purple-500/30'
                                }`}
                            >
                              <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-purple-200 dark:hover:bg-purple-500/20 transition-colors">
                                <Brain size={14} className="text-purple-600 dark:text-purple-400" />
                                <span className="text-purple-600 dark:text-purple-400 font-medium">思考过程</span>
                                <span className="text-zinc-500 text-xs ml-2">点击展开</span>
                                {hasMatch && <span className="text-xs bg-amber-200 dark:bg-amber-600 text-amber-800 dark:text-amber-100 px-1.5 rounded ml-auto">有匹配</span>}
                              </summary>
                              <div className="px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap bg-purple-50 dark:bg-zinc-900/50 max-h-96 overflow-y-auto">
                                <HighlightText text={item.thinking} searchQuery={searchQuery} isCurrentMatch={isCurrentMatch(messageIndex, i)} />
                              </div>
                            </details>
                          );
                        }
                        if (item.type === 'command' && item.commandName) {
                          return (
                            <div
                              key={i}
                              className="text-sm bg-amber-100 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 rounded-lg overflow-hidden"
                            >
                              <div className="flex items-center gap-2 px-3 py-2">
                                <Hash size={14} className="text-amber-600 dark:text-amber-400" />
                                <span className="text-amber-600 dark:text-amber-400 font-medium">{item.commandName}</span>
                                {item.commandArgs && (
                                  <span className="text-zinc-600 dark:text-zinc-300 ml-2">{item.commandArgs}</span>
                                )}
                              </div>
                            </div>
                          );
                        }
                        if (item.type === 'command-result' && item.commandResult) {
                          const resultKey = `${messageIndex}-${i}`;
                          return (
                            <div
                              key={i}
                              ref={(el) => { if (el) messageRefs.current.set(resultKey, el); }}
                              className={`text-sm rounded-lg overflow-hidden border ${isCurrentMatch(messageIndex, i)
                                ? 'border-amber-500 ring-2 ring-amber-500/50'
                                : item.isError
                                  ? 'border-red-300 dark:border-red-500/30'
                                  : 'border-green-300 dark:border-green-500/30'
                                } ${item.isError
                                  ? 'bg-red-100 dark:bg-red-500/10'
                                  : 'bg-green-100 dark:bg-green-500/10'
                                }`}
                            >
                              <div className="flex items-center gap-2 px-3 py-2">
                                {item.isError ? (
                                  <XCircle size={14} className="text-red-600 dark:text-red-400" />
                                ) : (
                                  <CheckCircle size={14} className="text-green-600 dark:text-green-400" />
                                )}
                                <span className={item.isError ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}>
                                  {item.isError ? '执行失败' : '执行结果'}
                                </span>
                              </div>
                              <div className="px-3 py-2 text-xs text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap bg-zinc-100 dark:bg-zinc-800 max-h-48 overflow-y-auto font-mono">
                                <HighlightText text={item.commandResult} searchQuery={searchQuery} isCurrentMatch={isCurrentMatch(messageIndex, i)} />
                              </div>
                            </div>
                          );
                        }
                        if (item.type === 'user-answer' && item.userAnswers) {
                          return (
                            <div
                              key={i}
                              className="text-sm bg-amber-100 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 rounded-lg overflow-hidden"
                            >
                              <div className="flex items-center gap-2 px-3 py-2 bg-amber-200 dark:bg-amber-500/20 border-b border-amber-300 dark:border-amber-500/30">
                                <MessageSquare size={14} className="text-amber-600 dark:text-amber-400" />
                                <span className="text-amber-600 dark:text-amber-400 font-medium">我的回答</span>
                              </div>
                              <div className="px-3 py-2 space-y-2">
                                {Object.entries(item.userAnswers).map(([question, answer], idx) => (
                                  <div key={idx} className="text-xs">
                                    <div className="text-zinc-600 dark:text-zinc-400 mb-1">Q: {question}</div>
                                    <div className="text-amber-600 dark:text-amber-300 font-medium pl-3">A: {answer}</div>
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
                              className="text-sm bg-slate-100 dark:bg-slate-500/10 border border-slate-300 dark:border-slate-500/30 rounded-lg overflow-hidden"
                            >
                              <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-500/20 transition-colors">
                                <FileText size={14} className="text-slate-600 dark:text-slate-400" />
                                <span className="text-slate-600 dark:text-slate-400 font-medium">上下文摘要</span>
                                <span className="text-zinc-500 text-xs ml-2">对话延续自上一个会话，点击展开查看摘要</span>
                              </summary>
                              <div className="px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400 bg-slate-50 dark:bg-zinc-900/50 max-h-96 overflow-y-auto">
                                <div className="prose prose-zinc dark:prose-invert prose-xs max-w-none">
                                  <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    components={{
                                      a: ({ href, children }) => (
                                        <a href={href} target="_blank" rel="noopener noreferrer" className="text-slate-600 dark:text-slate-400 hover:text-slate-500 dark:hover:text-slate-300 underline">
                                          {children}
                                        </a>
                                      ),
                                      code: ({ className, children, ...props }) => (
                                        <code className="bg-zinc-200 dark:bg-zinc-800 px-1 py-0.5 rounded text-slate-700 dark:text-slate-300 text-xs" {...props}>
                                          {children}
                                        </code>
                                      ),
                                      pre: ({ children }) => (
                                        <pre className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 p-2 rounded overflow-x-auto my-1">
                                          {children}
                                        </pre>
                                      ),
                                      h1: ({ children }) => (
                                        <h1 className="text-sm font-bold text-slate-700 dark:text-slate-300 mt-2 mb-1">{children}</h1>
                                      ),
                                      h2: ({ children }) => (
                                        <h2 className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-2 mb-1">{children}</h2>
                                      ),
                                      h3: ({ children }) => (
                                        <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-1 mb-0.5">{children}</h3>
                                      ),
                                      ul: ({ children }) => (
                                        <ul className="list-disc list-inside my-1 space-y-0.5 text-zinc-600 dark:text-zinc-400">
                                          {children}
                                        </ul>
                                      ),
                                      ol: ({ children }) => (
                                        <ol className="list-decimal list-inside my-1 space-y-0.5 text-zinc-600 dark:text-zinc-400">
                                          {children}
                                        </ol>
                                      ),
                                      p: ({ children }) => (
                                        <p className="my-1 leading-relaxed text-zinc-600 dark:text-zinc-400">{children}</p>
                                      ),
                                      strong: ({ children }) => (
                                        <strong className="font-semibold text-slate-700 dark:text-slate-300">{children}</strong>
                                      ),
                                      hr: () => (
                                        <hr className="border-zinc-300 dark:border-zinc-700 my-2" />
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
                                className="text-sm bg-cyan-100 dark:bg-cyan-500/10 border border-cyan-300 dark:border-cyan-500/30 rounded-lg overflow-hidden"
                              >
                                <div className="flex items-center gap-2 px-3 py-2 bg-cyan-200 dark:bg-cyan-500/20 border-b border-cyan-300 dark:border-cyan-500/30">
                                  <HelpCircle size={14} className="text-cyan-600 dark:text-cyan-400" />
                                  <span className="text-cyan-600 dark:text-cyan-400 font-medium">询问用户</span>
                                </div>
                                <div className="px-3 py-2 space-y-3">
                                  {item.questions.map((q, qIdx) => (
                                    <div key={qIdx} className="text-xs">
                                      <div className="text-cyan-700 dark:text-cyan-300 font-medium mb-2">
                                        {q.header && <span className="text-cyan-600 dark:text-cyan-500">[{q.header}] </span>}
                                        {q.question}
                                      </div>
                                      <div className="pl-3 space-y-1">
                                        {q.options.map((opt, optIdx) => (
                                          <div key={optIdx} className="flex items-start gap-2">
                                            <span className="text-zinc-500">•</span>
                                            <div>
                                              <span className="text-zinc-700 dark:text-zinc-300">{opt.label}</span>
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
                              className="text-sm bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg overflow-hidden"
                            >
                              <div className="flex items-center gap-2 px-3 py-2 bg-zinc-200 dark:bg-zinc-700/50 border-b border-zinc-300 dark:border-zinc-700">
                                <span className="text-blue-600 dark:text-blue-400">{getToolIcon(item.toolName)}</span>
                                <span className="text-blue-600 dark:text-blue-400 font-medium">{getToolLabel(item.toolName)}</span>
                              </div>
                              {item.toolDescription && (
                                <div className="px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400 border-b border-zinc-300 dark:border-zinc-700">
                                  {item.toolDescription}
                                </div>
                              )}
                              {item.toolCommand && (
                                <div className="px-3 py-2 font-mono text-xs text-green-700 dark:text-green-400 bg-zinc-100 dark:bg-zinc-800 overflow-x-auto">
                                  <code>$ {item.toolCommand}</code>
                                </div>
                              )}
                              {item.toolFilePath && !item.toolCommand && (
                                <div className="px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400 font-mono">
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
                    <div className="text-xs text-zinc-500 mt-1">
                      {new Date(message.timestamp).toLocaleString('zh-CN')}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Selection Mode Action Bar */}
      {selectionMode && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-30 animate-in slide-in-from-bottom-4">
          <div className="flex items-center gap-3 px-4 py-3 bg-zinc-900/95 backdrop-blur-sm rounded-xl shadow-2xl border border-zinc-700">
            <div className="flex items-center gap-2 text-white">
              <CheckSquare size={18} className="text-amber-400" />
              <span className="text-sm">
                {selectionStart === null ? (
                  '点击消息选择起点'
                ) : selectionEnd === null ? (
                  <span>已选起点 <span className="text-amber-400">#{selectionStart + 1}</span>，点击选择终点</span>
                ) : (
                  <span>已选 <span className="text-amber-400">{getSelectedCount()}</span> 条消息</span>
                )}
              </span>
            </div>

            {selectionStart !== null && (
              <>
                <div className="w-px h-6 bg-zinc-600" />
                <button
                  onClick={clearSelection}
                  className="px-3 py-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
                >
                  清除选择
                </button>
                {selectionEnd !== null && (
                  <button
                    onClick={exportSelectedMessages}
                    disabled={exportingSelection}
                    className="flex items-center gap-2 px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-black font-medium text-sm rounded-lg transition-colors disabled:opacity-50"
                  >
                    {exportingSelection ? (
                      <RefreshCw size={14} className="animate-spin" />
                    ) : (
                      <Download size={14} />
                    )}
                    导出选中
                  </button>
                )}
              </>
            )}

            <div className="w-px h-6 bg-zinc-600" />
            <button
              onClick={exitSelectionMode}
              className="p-1.5 text-zinc-400 hover:text-white transition-colors"
              title="退出选择模式"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Scroll Navigation */}
      {session.messages.length > 5 && (
        <div className="fixed bottom-24 right-6 flex flex-col items-center gap-2 z-20">
          {/* Scroll percentage indicator */}
          <div className="bg-zinc-800/90 backdrop-blur-sm text-white px-3 py-1.5 rounded-full text-sm font-medium shadow-lg">
            {Math.round(scrollPercentage * 100)}%
          </div>

          {/* Navigation buttons */}
          <div className="flex flex-col bg-zinc-800/90 backdrop-blur-sm rounded-full shadow-lg overflow-hidden">
            <button
              onClick={scrollToTop}
              className="p-2 hover:bg-zinc-700 transition-colors text-white"
              title="跳转到顶部"
            >
              <ChevronUp size={20} />
            </button>
            <div className="h-px bg-zinc-700" />
            <button
              onClick={() => scrollToPosition(0.25)}
              className="px-3 py-1.5 hover:bg-zinc-700 transition-colors text-zinc-400 text-xs font-medium"
              title="跳转到 25%"
            >
              25%
            </button>
            <div className="h-px bg-zinc-700" />
            <button
              onClick={() => scrollToPosition(0.5)}
              className="px-3 py-1.5 hover:bg-zinc-700 transition-colors text-zinc-400 text-xs font-medium"
              title="跳转到 50%"
            >
              50%
            </button>
            <div className="h-px bg-zinc-700" />
            <button
              onClick={() => scrollToPosition(0.75)}
              className="px-3 py-1.5 hover:bg-zinc-700 transition-colors text-zinc-400 text-xs font-medium"
              title="跳转到 75%"
            >
              75%
            </button>
            <div className="h-px bg-zinc-700" />
            <button
              onClick={scrollToBottom}
              className="p-2 hover:bg-zinc-700 transition-colors text-white"
              title="跳转到底部"
            >
              <ChevronDown size={20} />
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      {isRemote ? (
        <div className="border-t border-zinc-200 dark:border-zinc-800 bg-amber-50/50 dark:bg-amber-900/10 backdrop-blur-sm p-4">
          <div className="max-w-4xl mx-auto text-center">
            <div className="flex items-center justify-center gap-2 text-amber-600 dark:text-amber-400 mb-2">
              <Server size={18} />
              <span className="font-medium">远程会话</span>
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              这是来自 <span className="text-amber-600 dark:text-amber-400 font-medium">{remoteSource?.hostName}</span> 的会话，无法直接在此继续对话。
            </p>
            <p className="text-sm text-zinc-500 dark:text-zinc-500 mt-1">
              您可以点击右上角的 <span className="text-blue-600 dark:text-blue-400">复制到本地</span> 或 <span className="text-amber-600 dark:text-amber-400">SSH恢复</span> 来继续会话。
            </p>
          </div>
        </div>
      ) : isCodexSession ? (
        <div className="border-t border-zinc-200 dark:border-zinc-800 bg-blue-50/50 dark:bg-blue-900/10 backdrop-blur-sm p-4">
          <div className="max-w-4xl mx-auto text-center">
            <div className="flex items-center justify-center gap-2 text-blue-600 dark:text-blue-400 mb-2">
              <Code size={18} />
              <span className="font-medium">Codex 会话（只读）</span>
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              该会话来自 Codex 日志，当前页面支持完整查看消息，但不支持直接在这里继续 Claude CLI 对话。
            </p>
          </div>
        </div>
      ) : (
        <ChatInput onSend={handleSend} sending={sending} />
      )}

      {/* Session Actions Panel */}
      {showSessionActions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowSessionActions(false)}
          />

          {/* Modal */}
          <div className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-xl shadow-xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <Settings size={20} />
                会话操作
              </h2>
              <button
                onClick={() => setShowSessionActions(false)}
                className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              <SessionActions
                sessionId={session.id}
                onNameChange={(name) => {
                  setSession(prev => prev ? { ...prev, customName: name ?? undefined } : null);
                  // 自动关闭弹窗并显示全局提示
                  setShowSessionActions(false);
                  setRenameSuccess(name ? `已重命名为「${name}」` : '已清除自定义名称');
                  setTimeout(() => setRenameSuccess(null), 3000);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Token Stats Panel */}
      {showTokenStats && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowTokenStats(false)}
          />

          {/* Modal */}
          <div className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-xl shadow-xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <Coins size={20} />
                Token 统计
              </h2>
              <button
                onClick={() => setShowTokenStats(false)}
                className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              <TokenStats sessionId={session.id} />
            </div>
          </div>
        </div>
      )}

      {/* File Changes Panel */}
      {showFileChanges && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowFileChanges(false)}
          />

          {/* Modal */}
          <div className="relative w-full max-w-lg bg-white dark:bg-zinc-900 rounded-xl shadow-xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <FolderTree size={20} />
                文件变更
              </h2>
              <button
                onClick={() => setShowFileChanges(false)}
                className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              <FileChanges sessionId={session.id} />
            </div>
          </div>
        </div>
      )}

      {/* Code Snippets Panel */}
      {showCodeSnippets && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowCodeSnippets(false)}
          />

          {/* Panel */}
          <div className="absolute right-0 top-0 bottom-0 w-full max-w-2xl bg-white dark:bg-zinc-900 shadow-xl overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <Code size={20} />
                代码片段
              </h2>
              <button
                onClick={() => setShowCodeSnippets(false)}
                className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <CodeSnippets messages={session.messages} />
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-700 p-6 max-w-md mx-4">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-2">
              确认删除会话
            </h3>
            <p className="text-zinc-600 dark:text-zinc-400 mb-6">
              确定要删除这个会话吗？此操作无法撤销。
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="px-4 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleDeleteSession}
                disabled={deleting}
                className="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {deleting ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    删除中...
                  </>
                ) : (
                  <>
                    <Trash2 size={16} />
                    确认删除
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
