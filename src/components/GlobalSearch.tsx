'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, User, Bot, Loader2, FolderOpen } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface SearchResult {
  sessionId: string;
  projectName: string;
  projectPath: string;
  matchedText: string;
  messageType: 'user' | 'assistant';
  timestamp: string;
  context: string;
}

export default function GlobalSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Keyboard shortcut to open search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K to open search
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
      }
      // Escape to close
      if (e.key === 'Escape') {
        setIsOpen(false);
        setQuery('');
        setResults([]);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=30`);
        const data = await res.json();
        setResults(data.results || []);
        setSelectedIndex(0);
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      e.preventDefault();
      navigateToResult(results[selectedIndex]);
    }
  }, [results, selectedIndex]);

  const navigateToResult = (result: SearchResult) => {
    router.push(`/session/${result.sessionId}`);
    setIsOpen(false);
    setQuery('');
    setResults([]);
  };

  // Highlight matched text
  const highlightMatch = (text: string, matchedText: string) => {
    const index = text.toLowerCase().indexOf(matchedText.toLowerCase());
    if (index === -1) return text;

    return (
      <>
        {text.slice(0, index)}
        <mark className="bg-amber-200 dark:bg-amber-500/50 text-amber-900 dark:text-amber-100 px-0.5 rounded">
          {text.slice(index, index + matchedText.length)}
        </mark>
        {text.slice(index + matchedText.length)}
      </>
    );
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:border-zinc-300 dark:hover:border-zinc-600 transition-all whitespace-nowrap"
      >
        <Search size={16} className="flex-shrink-0" />
        <span className="text-sm hidden sm:inline">全局搜索</span>
        <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 text-xs bg-zinc-200 dark:bg-zinc-700 rounded">
          ⌘K
        </kbd>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => {
          setIsOpen(false);
          setQuery('');
          setResults([]);
        }}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl mx-4 bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-200 dark:border-zinc-700">
          <Search size={20} className="text-zinc-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="搜索所有会话..."
            className="flex-1 bg-transparent text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none"
          />
          {loading && <Loader2 size={18} className="animate-spin text-zinc-400" />}
          <button
            onClick={() => {
              setIsOpen(false);
              setQuery('');
              setResults([]);
            }}
            className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded"
          >
            <X size={18} className="text-zinc-400" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {query.length < 2 ? (
            <div className="px-4 py-8 text-center text-zinc-500">
              <Search size={32} className="mx-auto mb-2 opacity-50" />
              <p>输入至少 2 个字符开始搜索</p>
              <p className="text-xs mt-1">搜索所有会话中的消息内容</p>
            </div>
          ) : results.length === 0 && !loading ? (
            <div className="px-4 py-8 text-center text-zinc-500">
              <p>没有找到匹配的结果</p>
            </div>
          ) : (
            <div className="py-2">
              {results.map((result, index) => (
                <button
                  key={`${result.sessionId}-${result.timestamp}-${index}`}
                  onClick={() => navigateToResult(result)}
                  className={`w-full px-4 py-3 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors ${
                    index === selectedIndex ? 'bg-zinc-100 dark:bg-zinc-800' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 p-1.5 rounded-full ${
                      result.messageType === 'user'
                        ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400'
                        : 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400'
                    }`}>
                      {result.messageType === 'user' ? <User size={14} /> : <Bot size={14} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-zinc-500 flex items-center gap-1">
                          <FolderOpen size={12} />
                          {result.projectName}
                        </span>
                        {result.timestamp && (
                          <span className="text-xs text-zinc-400">
                            {formatDistanceToNow(new Date(result.timestamp), {
                              addSuffix: true,
                              locale: zhCN,
                            })}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-zinc-700 dark:text-zinc-300 line-clamp-2">
                        {highlightMatch(result.context, result.matchedText)}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-700 rounded">↑↓</kbd>
                导航
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-700 rounded">Enter</kbd>
                打开
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-700 rounded">Esc</kbd>
                关闭
              </span>
            </div>
            {results.length > 0 && (
              <span>找到 {results.length} 个结果</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
