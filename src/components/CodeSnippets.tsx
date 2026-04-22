'use client';

import { useState, useMemo } from 'react';
import { Code, Copy, Check, ChevronDown, ChevronRight } from 'lucide-react';

interface CodeBlock {
  language: string;
  code: string;
  timestamp?: string;
  source: 'user' | 'assistant';
}

interface CodeSnippetsProps {
  messages: Array<{
    type: string;
    timestamp?: string;
    richContent: Array<{
      type: string;
      text?: string;
      toolCommand?: string;
    }>;
    role: string;
  }>;
}

// Extract language from markdown code block
function extractCodeBlocks(text: string): { language: string; code: string }[] {
  const blocks: { language: string; code: string }[] = [];
  const regex = /```(\w+)?\n([\s\S]*?)```/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const language = match[1] || 'text';
    const code = match[2].trim();
    if (code.length > 0) {
      blocks.push({ language, code });
    }
  }

  return blocks;
}

// Language color mapping
const languageColors: Record<string, string> = {
  javascript: 'bg-yellow-500',
  typescript: 'bg-blue-500',
  python: 'bg-green-500',
  bash: 'bg-gray-500',
  shell: 'bg-gray-500',
  json: 'bg-orange-500',
  html: 'bg-red-500',
  css: 'bg-pink-500',
  sql: 'bg-purple-500',
  rust: 'bg-orange-600',
  go: 'bg-cyan-500',
  java: 'bg-red-600',
  cpp: 'bg-blue-600',
  c: 'bg-blue-700',
  text: 'bg-zinc-500',
};

export default function CodeSnippets({ messages }: CodeSnippetsProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('all');
  const [expandedBlocks, setExpandedBlocks] = useState<Set<number>>(new Set());

  // Extract all code blocks from messages
  const codeBlocks = useMemo(() => {
    const blocks: CodeBlock[] = [];

    for (const message of messages) {
      for (const item of message.richContent) {
        // From text content (markdown code blocks)
        if (item.type === 'text' && item.text) {
          const extracted = extractCodeBlocks(item.text);
          for (const block of extracted) {
            blocks.push({
              ...block,
              timestamp: message.timestamp,
              source: message.role as 'user' | 'assistant',
            });
          }
        }

        // From tool commands (bash)
        if (item.type === 'tool' && item.toolCommand) {
          blocks.push({
            language: 'bash',
            code: item.toolCommand,
            timestamp: message.timestamp,
            source: 'assistant',
          });
        }
      }
    }

    return blocks;
  }, [messages]);

  // Get unique languages
  const languages = useMemo(() => {
    const langs = new Set(codeBlocks.map(b => b.language));
    return ['all', ...Array.from(langs).sort()];
  }, [codeBlocks]);

  // Filter by selected language
  const filteredBlocks = selectedLanguage === 'all'
    ? codeBlocks
    : codeBlocks.filter(b => b.language === selectedLanguage);

  // Copy to clipboard
  const copyCode = async (code: string, index: number) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const toggleExpand = (index: number) => {
    const newExpanded = new Set(expandedBlocks);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedBlocks(newExpanded);
  };

  if (codeBlocks.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-500">
        <Code size={48} className="mx-auto mb-4 opacity-50" />
        <p>此会话没有代码片段</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Language filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-zinc-500">筛选语言:</span>
        {languages.map(lang => (
          <button
            key={lang}
            onClick={() => setSelectedLanguage(lang)}
            className={`px-3 py-1 rounded-full text-sm transition-colors ${
              selectedLanguage === lang
                ? 'bg-amber-500 text-black'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
            }`}
          >
            {lang === 'all' ? '全部' : lang}
            {lang !== 'all' && (
              <span className="ml-1 opacity-70">
                ({codeBlocks.filter(b => b.language === lang).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="text-sm text-zinc-500">
        共 {filteredBlocks.length} 个代码片段
      </div>

      {/* Code blocks */}
      <div className="space-y-3">
        {filteredBlocks.map((block, index) => {
          const isExpanded = expandedBlocks.has(index);
          const lines = block.code.split('\n');
          const isLong = lines.length > 10;
          const displayCode = isLong && !isExpanded
            ? lines.slice(0, 10).join('\n') + '\n...'
            : block.code;

          return (
            <div
              key={index}
              className="bg-zinc-100 dark:bg-zinc-800 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-3 py-2 bg-zinc-200 dark:bg-zinc-700/50 border-b border-zinc-300 dark:border-zinc-600">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${languageColors[block.language] || languageColors.text}`} />
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {block.language}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {lines.length} 行 · {block.source === 'user' ? '用户' : 'Claude'}
                  </span>
                </div>
                <button
                  onClick={() => copyCode(block.code, index)}
                  className="p-1.5 rounded hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                  title="复制代码"
                >
                  {copiedIndex === index ? (
                    <Check size={16} className="text-green-500" />
                  ) : (
                    <Copy size={16} />
                  )}
                </button>
              </div>

              {/* Code */}
              <pre className="p-3 overflow-x-auto text-sm text-zinc-800 dark:text-zinc-200 font-mono">
                <code>{displayCode}</code>
              </pre>

              {/* Expand button */}
              {isLong && (
                <button
                  onClick={() => toggleExpand(index)}
                  className="w-full py-2 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700/50 flex items-center justify-center gap-1 border-t border-zinc-300 dark:border-zinc-600"
                >
                  {isExpanded ? (
                    <>
                      <ChevronDown size={16} />
                      收起
                    </>
                  ) : (
                    <>
                      <ChevronRight size={16} />
                      展开全部 ({lines.length} 行)
                    </>
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
