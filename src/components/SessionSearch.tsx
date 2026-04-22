'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react';

interface SessionSearchProps {
  onSearch: (query: string) => void;
  matchCount: number;
  currentMatch: number;
  onPrevMatch: () => void;
  onNextMatch: () => void;
  onClose: () => void;
}

export default function SessionSearch({
  onSearch,
  matchCount,
  currentMatch,
  onPrevMatch,
  onNextMatch,
  onClose,
}: SessionSearchProps) {
  const [query, setQuery] = useState('');
  const [isVisible, setIsVisible] = useState(false);

  // Listen for Cmd+F / Ctrl+F to open search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setIsVisible(true);
      }
      if (e.key === 'Escape' && isVisible) {
        handleClose();
      }
      // Navigate with Enter (next) and Shift+Enter (prev)
      if (e.key === 'Enter' && isVisible && matchCount > 0) {
        e.preventDefault();
        if (e.shiftKey) {
          onPrevMatch();
        } else {
          onNextMatch();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, matchCount, onPrevMatch, onNextMatch]);

  const handleClose = useCallback(() => {
    setIsVisible(false);
    setQuery('');
    onClose();
  }, [onClose]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    onSearch(value);
  };

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        className="p-2 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
        title="搜索 (Cmd+F)"
      >
        <Search size={18} />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-lg px-3 py-1.5 shadow-lg">
      <Search size={16} className="text-zinc-400 flex-shrink-0" />
      <input
        type="text"
        value={query}
        onChange={(e) => handleQueryChange(e.target.value)}
        placeholder="搜索会话内容..."
        className="bg-transparent border-none outline-none text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 w-48"
        autoFocus
      />

      {query && (
        <>
          <span className="text-xs text-zinc-500 whitespace-nowrap">
            {matchCount > 0 ? `${currentMatch + 1}/${matchCount}` : '无匹配'}
          </span>

          <div className="flex items-center gap-0.5 border-l border-zinc-300 dark:border-zinc-600 pl-2">
            <button
              onClick={onPrevMatch}
              disabled={matchCount === 0}
              className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-600 dark:text-zinc-300"
              title="上一个 (Shift+Enter)"
            >
              <ChevronUp size={14} />
            </button>
            <button
              onClick={onNextMatch}
              disabled={matchCount === 0}
              className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-600 dark:text-zinc-300"
              title="下一个 (Enter)"
            >
              <ChevronDown size={14} />
            </button>
          </div>
        </>
      )}

      <button
        onClick={handleClose}
        className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
        title="关闭 (Esc)"
      >
        <X size={14} />
      </button>
    </div>
  );
}
