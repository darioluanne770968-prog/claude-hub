'use client';

import { useState, useEffect } from 'react';
import { Star, Archive, Edit3, FileText, Check, X, Loader2 } from 'lucide-react';

interface SessionActionsProps {
  sessionId: string;
  compact?: boolean;
  onNameChange?: (name: string | null) => void;
}

interface SessionData {
  isFavorite: boolean;
  isArchived: boolean;
  customName: string | null;
  note: string | null;
}

export default function SessionActions({ sessionId, compact = false, onNameChange }: SessionActionsProps) {
  const [data, setData] = useState<SessionData>({
    isFavorite: false,
    isArchived: false,
    customName: null,
    note: null,
  });
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [sessionId]);

  const fetchData = async () => {
    try {
      const res = await fetch(`/api/user-data?sessionId=${sessionId}`);
      const result = await res.json();
      setData(result);
      setNameInput(result.customName || '');
      setNoteInput(result.note || '');
    } catch (error) {
      console.error('Failed to fetch session data:', error);
    } finally {
      setLoading(false);
    }
  };

  const performAction = async (action: string, value?: string | null): Promise<boolean> => {
    setSaving(true);
    try {
      const res = await fetch('/api/user-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, sessionId, value }),
      });
      const result = await res.json();
      if (result.success) {
        setData(result.data);
        if (action === 'setCustomName') {
          onNameChange?.(value || null);
        }
        return true;
      } else {
        console.error('Action failed:', result.error);
        alert('操作失败，请重试');
        return false;
      }
    } catch (error) {
      console.error('Failed to perform action:', error);
      alert('网络错误，请检查连接');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveName = async () => {
    const newName = nameInput.trim() || null;
    const success = await performAction('setCustomName', newName);
    if (success) {
      setEditingName(false);
      setSuccessMessage(newName ? `已重命名为「${newName}」` : '已清除自定义名称');
      setTimeout(() => setSuccessMessage(null), 3000);
    }
  };

  const handleSaveNote = async () => {
    const success = await performAction('setNote', noteInput.trim() || null);
    if (success) {
      setEditingNote(false);
      setSuccessMessage('笔记已保存');
      setTimeout(() => setSuccessMessage(null), 3000);
    }
  };

  if (loading) {
    return <Loader2 size={16} className="animate-spin text-zinc-400" />;
  }

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); performAction('toggleFavorite'); }}
          className={`p-1 rounded transition-colors ${data.isFavorite
            ? 'text-amber-500 hover:text-amber-600'
            : 'text-zinc-400 hover:text-amber-500'
            }`}
          title={data.isFavorite ? '取消收藏' : '收藏'}
        >
          <Star size={14} fill={data.isFavorite ? 'currentColor' : 'none'} />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Success Toast */}
      {successMessage && (
        <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-700 dark:text-green-400 text-sm animate-in fade-in slide-in-from-top-2">
          <Check size={16} />
          {successMessage}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => performAction('toggleFavorite')}
          disabled={saving}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${data.isFavorite
            ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-amber-500'
            }`}
        >
          <Star size={14} fill={data.isFavorite ? 'currentColor' : 'none'} />
          {data.isFavorite ? '已收藏' : '收藏'}
        </button>

        <button
          onClick={() => performAction('toggleArchive')}
          disabled={saving}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${data.isArchived
            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-blue-500'
            }`}
        >
          <Archive size={14} />
          {data.isArchived ? '已归档' : '归档'}
        </button>

        <button
          onClick={() => setEditingName(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
        >
          <Edit3 size={14} />
          重命名
        </button>

        <button
          onClick={() => setEditingNote(true)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${data.note
            ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-green-500'
            }`}
        >
          <FileText size={14} />
          {data.note ? '查看笔记' : '添加笔记'}
        </button>
      </div>

      {/* Custom name editor */}
      {editingName && (
        <div className="flex items-center gap-2 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
          <input
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="输入自定义名称..."
            className="flex-1 px-3 py-1.5 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-lg text-sm focus:outline-none focus:border-amber-500"
            autoFocus
          />
          <button
            onClick={handleSaveName}
            disabled={saving}
            className="p-1.5 rounded-lg bg-green-500 text-white hover:bg-green-600 transition-colors"
          >
            <Check size={16} />
          </button>
          <button
            onClick={() => { setEditingName(false); setNameInput(data.customName || ''); }}
            className="p-1.5 rounded-lg bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Note editor */}
      {editingNote && (
        <div className="p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg space-y-2">
          <textarea
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            placeholder="添加笔记..."
            rows={4}
            className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-lg text-sm focus:outline-none focus:border-amber-500 resize-none"
            autoFocus
          />
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={() => { setEditingNote(false); setNoteInput(data.note || ''); }}
              className="px-3 py-1.5 rounded-lg bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-sm transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSaveNote}
              disabled={saving}
              className="px-3 py-1.5 rounded-lg bg-green-500 text-white hover:bg-green-600 text-sm transition-colors"
            >
              保存笔记
            </button>
          </div>
        </div>
      )}

      {/* Display note if exists and not editing */}
      {data.note && !editingNote && (
        <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-400 text-xs font-medium mb-1">
            <FileText size={12} />
            笔记
          </div>
          <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{data.note}</p>
        </div>
      )}
    </div>
  );
}
