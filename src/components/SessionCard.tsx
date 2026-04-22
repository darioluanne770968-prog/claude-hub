'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import SessionPreview from './SessionPreview';
import SummaryDetailPopup from './SummaryDetailPopup';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { MessageSquare, Clock, FolderOpen, Trash2, Server, Eye, Pencil, Code2 } from 'lucide-react';
import TerminalButton from './TerminalButton';

interface SessionSource {
  type: 'local' | 'remote';
  hostId?: string;
  hostName?: string;
}

interface SummaryWithTimestamp {
  text: string;
  timestamp: string;
}

interface SessionCardProps {
  id: string;
  provider?: 'claude' | 'codex';
  projectName: string;
  projectPath: string;
  originalProjectPath?: string;  // Original path for terminal resume
  summaries: string[];
  summariesWithTimestamps?: SummaryWithTimestamp[];
  customName?: string;
  lastModified: string;
  firstMessage?: string;
  messageCount: number;
  source?: SessionSource;
  tags?: string[];
  isIde?: boolean;  // Whether session is from VS Code/IDE
  onDelete?: (id: string) => void;
  onRename?: (id: string, newName: string) => void;
}

export default function SessionCard({
  id,
  provider = 'claude',
  projectName,
  projectPath,
  originalProjectPath,
  summaries,
  summariesWithTimestamps = [],
  customName,
  lastModified,
  firstMessage,
  messageCount,
  source,
  tags = [],
  isIde,
  onDelete,
  onRename,
}: SessionCardProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [showRename, setShowRename] = useState(false);
  const [renameValue, setRenameValue] = useState(customName || '');
  const [renaming, setRenaming] = useState(false);
  const [selectedSummary, setSelectedSummary] = useState<{ text: string; timestamp?: string } | null>(null);
  const [showMoreSummaries, setShowMoreSummaries] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Toggle preview on button click
  const handlePreviewClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (showPreview) {
      setShowPreview(false);
    } else if (cardRef.current) {
      setAnchorRect(cardRef.current.getBoundingClientRect());
      setShowPreview(true);
    }
  }, [showPreview]);

  // Close preview
  const closePreview = useCallback(() => {
    setShowPreview(false);
  }, []);

  // Clean IDE tags from text (frontend fallback)
  const cleanIdeTags = (text: string): string => {
    if (!text) return '';
    return text
      .replace(/<ide_opened_file>[\s\S]*?<\/ide_opened_file>/g, '')
      .replace(/<ide_context>[\s\S]*?<\/ide_context>/g, '')
      .replace(/<ide_selection>[\s\S]*?<\/ide_selection>/g, '')
      .trim();
  };

  // Priority: customName > summaries[0] > firstMessage
  // Apply IDE tag cleaning as fallback
  const rawSummary = customName || summaries[0] || firstMessage || '';
  const displaySummary = cleanIdeTags(rawSummary) || 'No summary available';

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowConfirm(true);
  };

  const confirmDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleting(true);

    try {
      const res = await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
      if (res.ok) {
        onDelete?.(id);
      } else {
        alert('删除失败');
      }
    } catch {
      alert('删除失败');
    } finally {
      setDeleting(false);
      setShowConfirm(false);
    }
  };

  const cancelDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowConfirm(false);
  };

  // Rename handlers
  const handleRenameClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setRenameValue(customName || '');
    setShowRename(true);
    setTimeout(() => renameInputRef.current?.focus(), 100);
  };

  const confirmRename = async (e: React.MouseEvent | React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const trimmedValue = renameValue.trim();
    if (!trimmedValue && !customName) {
      setShowRename(false);
      return;
    }

    setRenaming(true);
    try {
      const res = await fetch('/api/user-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'setCustomName',
          sessionId: id,
          value: trimmedValue || null,
        }),
      });
      if (res.ok) {
        onRename?.(id, trimmedValue);
        setShowRename(false);
      } else {
        alert('重命名失败');
      }
    } catch {
      alert('重命名失败');
    } finally {
      setRenaming(false);
    }
  };

  const cancelRename = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowRename(false);
    setRenameValue(customName || '');
  };

  // Build URL with source info for remote sessions
  const sessionUrl = source?.type === 'remote' && source.hostId
    ? `/session/${id}?hostId=${source.hostId}&projectPath=${encodeURIComponent(projectPath)}&hostName=${encodeURIComponent(source.hostName || 'Remote')}`
    : `/session/${id}`;

  // Handle card click for navigation
  const handleCardClick = useCallback(() => {
    router.push(sessionUrl);
  }, [router, sessionUrl]);

  return (
    <>
      <div
        ref={cardRef}
        onClick={handleCardClick}
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 hover:border-zinc-300 dark:hover:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-all cursor-pointer relative group shadow-sm dark:shadow-none"
      >
          {/* Action buttons */}
          <div className="absolute top-3 right-3 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
            <button
              onClick={handleRenameClick}
              className="p-1.5 rounded-md bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-400 dark:text-zinc-500 hover:text-blue-500 dark:hover:text-blue-400 hover:border-blue-300 dark:hover:border-blue-500/50 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-all"
              title="重命名会话"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={handlePreviewClick}
              className="p-1.5 rounded-md bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-400 dark:text-zinc-500 hover:text-amber-500 dark:hover:text-amber-400 hover:border-amber-300 dark:hover:border-amber-500/50 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-all"
              title="预览会话"
            >
              <Eye size={14} />
            </button>
            {provider !== 'codex' && (
              <TerminalButton
                sessionId={id}
                projectPath={originalProjectPath || projectPath}
                variant="icon"
                source={source?.type === 'remote' ? {
                  type: 'remote',
                  hostId: source.hostId!,
                  hostName: source.hostName || 'Remote',
                } : undefined}
              />
            )}
            <button
              onClick={handleDelete}
              className="p-1.5 rounded-md bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-400 dark:text-zinc-500 hover:text-red-500 dark:hover:text-red-400 hover:border-red-300 dark:hover:border-red-500/50 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all"
              title="删除会话"
            >
              <Trash2 size={14} />
            </button>
          </div>

          {/* Delete confirmation modal */}
          {showConfirm && (
            <div
              className="absolute inset-0 bg-white/95 dark:bg-zinc-900/95 rounded-lg flex flex-col items-center justify-center z-10 p-4"
              onClick={(e) => e.preventDefault()}
            >
              <p className="text-zinc-900 dark:text-white text-sm mb-4 text-center">确定要删除这个会话吗？</p>
              <div className="flex gap-3">
                <button
                  onClick={confirmDelete}
                  disabled={deleting}
                  className="px-4 py-1.5 bg-red-500 hover:bg-red-600 disabled:bg-red-500/50 text-white text-sm font-medium rounded-md transition-colors"
                >
                  {deleting ? '删除中...' : '确定删除'}
                </button>
                <button
                  onClick={cancelDelete}
                  className="px-4 py-1.5 bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-700 dark:text-white text-sm font-medium rounded-md transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          )}

          {/* Rename modal */}
          {showRename && (
            <div
              className="absolute inset-0 bg-white/95 dark:bg-zinc-900/95 rounded-lg flex flex-col items-center justify-center z-10 p-4"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
            >
              <p className="text-zinc-900 dark:text-white text-sm mb-3 text-center">重命名会话</p>
              <form onSubmit={confirmRename} className="w-full max-w-xs" onClick={(e) => e.stopPropagation()}>
                <input
                  ref={renameInputRef}
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  placeholder="输入新名称（留空则清除）"
                  className="w-full px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-600 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="flex gap-3 justify-center">
                  <button
                    type="button"
                    onClick={confirmRename}
                    disabled={renaming}
                    className="px-4 py-1.5 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 text-white text-sm font-medium rounded-md transition-colors"
                  >
                    {renaming ? '保存中...' : '确定'}
                  </button>
                  <button
                    type="button"
                    onClick={cancelRename}
                    className="px-4 py-1.5 bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-700 dark:text-white text-sm font-medium rounded-md transition-colors"
                  >
                    取消
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="flex items-start justify-between gap-3 mb-3 pr-8">
            <div className="flex items-start gap-2 flex-1">
              {provider === 'codex' && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs whitespace-nowrap flex-shrink-0 mt-0.5" title="来自 Codex">
                  <Code2 size={12} />
                  Codex
                </span>
              )}
              {isIde && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 text-xs whitespace-nowrap flex-shrink-0 mt-0.5" title="来自 VS Code">
                  <Code2 size={12} />
                  IDE
                </span>
              )}
              <h3 className="font-medium text-zinc-900 dark:text-white line-clamp-2">
                {displaySummary}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm text-zinc-500 dark:text-zinc-400">
            <div className="flex items-center gap-1.5" title={projectPath}>
              <FolderOpen size={14} />
              <span className="truncate max-w-[300px] font-mono text-xs">{projectPath}</span>
            </div>

            <div className="flex items-center gap-1.5">
              <MessageSquare size={14} />
              <span>{messageCount} messages</span>
            </div>

            {tags.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                {tags.slice(0, 2).map(tag => (
                  <span
                    key={tag}
                    className="px-1.5 py-0.5 rounded-full text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
                  >
                    {tag}
                  </span>
                ))}
                {tags.length > 2 && (
                  <span className="text-xs text-zinc-500">+{tags.length - 2}</span>
                )}
              </div>
            )}

            {source?.type === 'remote' && source.hostName && (
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
                <Server size={12} />
                <span className="text-xs">{source.hostName}</span>
              </div>
            )}

            <div className="flex items-center gap-1.5 ml-auto">
              <Clock size={14} />
              <span>
                {formatDistanceToNow(new Date(lastModified), {
                  addSuffix: true,
                  locale: zhCN,
                })}
              </span>
            </div>
          </div>

          {summaries.length > 1 && (
            <div
              className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800"
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
              }}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
              }}
            >
              <div className="flex flex-wrap gap-2">
                {summaries.slice(0, 3).map((summary, i) => (
                  <span
                    key={i}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setSelectedSummary({
                        text: summary,
                        timestamp: summariesWithTimestamps[i]?.timestamp,
                      });
                    }}
                    className="summary-tag text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 px-2 py-1 rounded truncate max-w-[200px] cursor-pointer hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                  >
                    {summary}
                  </span>
                ))}
                {summaries.length > 3 && (
                  <div
                    ref={moreRef}
                    className="relative"
                    onMouseEnter={() => setShowMoreSummaries(true)}
                    onMouseLeave={() => setShowMoreSummaries(false)}
                  >
                    <span className="summary-tag text-xs text-zinc-500 cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-300">
                      +{summaries.length - 3} more
                    </span>

                    {/* Dropdown menu */}
                    {showMoreSummaries && (
                      <div className="absolute left-0 top-full mt-1 z-20 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg py-1 min-w-[250px] max-w-[350px]">
                        {summaries.slice(3).map((summary, i) => (
                          <button
                            key={i + 3}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setSelectedSummary({
                                text: summary,
                                timestamp: summariesWithTimestamps[i + 3]?.timestamp,
                              });
                              setShowMoreSummaries(false);
                            }}
                            className="w-full text-left px-3 py-2 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 truncate transition-colors"
                          >
                            {summary}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

      {/* Session Preview Popup */}
      {showPreview && anchorRect && (
        <SessionPreview
          sessionId={id}
          projectPath={projectPath}
          source={source}
          anchorRect={anchorRect}
          onClose={closePreview}
        />
      )}

      {/* Summary Detail Popup */}
      {selectedSummary && (
        <SummaryDetailPopup
          sessionId={id}
          summaryText={selectedSummary.text}
          summaryTimestamp={selectedSummary.timestamp}
          projectPath={projectPath}
          source={source}
          onClose={() => setSelectedSummary(null)}
        />
      )}
    </>
  );
}
