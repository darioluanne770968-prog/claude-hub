'use client';

import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { MessageSquare, Clock, FolderOpen, Trash2, X } from 'lucide-react';
import Link from 'next/link';

interface SessionCardProps {
  id: string;
  projectName: string;
  summaries: string[];
  customName?: string;
  lastModified: string;
  firstMessage?: string;
  messageCount: number;
  onDelete?: (id: string) => void;
}

export default function SessionCard({
  id,
  projectName,
  summaries,
  customName,
  lastModified,
  firstMessage,
  messageCount,
  onDelete,
}: SessionCardProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Priority: customName > summaries[0] > firstMessage
  const displaySummary = customName || summaries[0] || firstMessage || 'No summary available';

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

  return (
    <Link href={`/session/${id}`}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-600 hover:bg-zinc-800/50 transition-all cursor-pointer relative group">
        {/* Delete button */}
        <button
          onClick={handleDelete}
          className="absolute top-3 right-3 p-1.5 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-500 hover:text-red-400 hover:border-red-500/50 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
          title="删除会话"
        >
          <Trash2 size={14} />
        </button>

        {/* Delete confirmation modal */}
        {showConfirm && (
          <div
            className="absolute inset-0 bg-zinc-900/95 rounded-lg flex flex-col items-center justify-center z-10 p-4"
            onClick={(e) => e.preventDefault()}
          >
            <p className="text-white text-sm mb-4 text-center">确定要删除这个会话吗？</p>
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
                className="px-4 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white text-sm font-medium rounded-md transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        )}

        <div className="flex items-start justify-between gap-3 mb-3 pr-8">
          <h3 className="font-medium text-white line-clamp-2 flex-1">
            {displaySummary}
          </h3>
        </div>

        <div className="flex items-center gap-4 text-sm text-zinc-400">
          <div className="flex items-center gap-1.5">
            <FolderOpen size={14} />
            <span className="truncate max-w-[150px]">{projectName}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <MessageSquare size={14} />
            <span>{messageCount} messages</span>
          </div>

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
          <div className="mt-3 pt-3 border-t border-zinc-800">
            <div className="flex flex-wrap gap-2">
              {summaries.slice(0, 3).map((summary, i) => (
                <span
                  key={i}
                  className="text-xs bg-zinc-800 text-zinc-400 px-2 py-1 rounded truncate max-w-[200px]"
                >
                  {summary}
                </span>
              ))}
              {summaries.length > 3 && (
                <span className="text-xs text-zinc-500">
                  +{summaries.length - 3} more
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}
