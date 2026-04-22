'use client';

import { useState, useEffect } from 'react';
import { FileCode, FilePlus, FileEdit, Eye, RefreshCw, FolderOpen } from 'lucide-react';

interface FileChangesSummary {
  totalOperations: number;
  filesRead: number;
  filesWritten: number;
  filesEdited: number;
  filesCreated: number;
  uniqueFilesModified: number;
}

interface FilesData {
  read: string[];
  written: string[];
  edited: string[];
  created: string[];
  modified: string[];
}

interface FileChangesProps {
  sessionId: string;
}

export default function FileChanges({ sessionId }: FileChangesProps) {
  const [summary, setSummary] = useState<FileChangesSummary | null>(null);
  const [files, setFiles] = useState<FilesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'modified' | 'read' | 'all'>('modified');

  useEffect(() => {
    fetchData();
  }, [sessionId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/files`);
      if (res.ok) {
        const data = await res.json();
        setSummary(data.summary);
        setFiles(data.files);
      }
    } catch (error) {
      console.error('Failed to fetch file changes:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-zinc-500 text-sm p-4">
        <RefreshCw size={14} className="animate-spin" />
        <span>分析文件变更...</span>
      </div>
    );
  }

  if (!summary || !files) {
    return (
      <div className="text-zinc-500 text-sm p-4">暂无文件操作记录</div>
    );
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'created':
        return <FilePlus size={14} className="text-green-500" />;
      case 'edited':
        return <FileEdit size={14} className="text-amber-500" />;
      case 'read':
        return <Eye size={14} className="text-blue-500" />;
      default:
        return <FileCode size={14} className="text-zinc-500" />;
    }
  };

  const currentFiles = activeTab === 'modified'
    ? files.modified
    : activeTab === 'read'
      ? files.read
      : [...new Set([...files.modified, ...files.read])];

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
            {summary.filesCreated}
          </div>
          <div className="text-xs text-green-700 dark:text-green-500">新建文件</div>
        </div>
        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
            {summary.filesEdited}
          </div>
          <div className="text-xs text-amber-700 dark:text-amber-500">编辑文件</div>
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {summary.filesRead}
          </div>
          <div className="text-xs text-blue-700 dark:text-blue-500">读取文件</div>
        </div>
        <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
            {summary.totalOperations}
          </div>
          <div className="text-xs text-purple-700 dark:text-purple-500">总操作数</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-700">
        <button
          onClick={() => setActiveTab('modified')}
          className={`px-3 py-2 text-sm border-b-2 transition-colors ${
            activeTab === 'modified'
              ? 'border-amber-500 text-amber-600 dark:text-amber-400'
              : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
          }`}
        >
          修改的文件 ({files.modified.length})
        </button>
        <button
          onClick={() => setActiveTab('read')}
          className={`px-3 py-2 text-sm border-b-2 transition-colors ${
            activeTab === 'read'
              ? 'border-amber-500 text-amber-600 dark:text-amber-400'
              : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
          }`}
        >
          读取的文件 ({files.read.length})
        </button>
        <button
          onClick={() => setActiveTab('all')}
          className={`px-3 py-2 text-sm border-b-2 transition-colors ${
            activeTab === 'all'
              ? 'border-amber-500 text-amber-600 dark:text-amber-400'
              : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
          }`}
        >
          全部
        </button>
      </div>

      {/* File list */}
      <div className="space-y-1 max-h-80 overflow-y-auto">
        {currentFiles.length === 0 ? (
          <div className="text-zinc-500 text-sm text-center py-4">暂无文件</div>
        ) : (
          currentFiles.map((file, i) => {
            const isCreated = files.created.includes(file);
            const isEdited = files.edited.includes(file);
            const isRead = files.read.includes(file) && !isCreated && !isEdited;

            return (
              <div
                key={i}
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                {isCreated ? getIcon('created') : isEdited ? getIcon('edited') : getIcon('read')}
                <span className="text-sm text-zinc-700 dark:text-zinc-300 font-mono truncate flex-1">
                  {file}
                </span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  isCreated
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                    : isEdited
                      ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                      : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                }`}>
                  {isCreated ? '新建' : isEdited ? '编辑' : '读取'}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
