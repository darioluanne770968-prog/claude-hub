'use client';

import { useState, useEffect } from 'react';
import { FileText, Plus, Trash2, Copy, Check, X } from 'lucide-react';

interface Template {
  id: string;
  name: string;
  content: string;
  createdAt: string;
}

interface TemplateManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate?: (content: string) => void;
}

export default function TemplateManager({ isOpen, onClose, onSelectTemplate }: TemplateManagerProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newContent, setNewContent] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchTemplates();
    }
  }, [isOpen]);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/user-data?field=templates');
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch (error) {
      console.error('Failed to fetch templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const addTemplate = async () => {
    if (!newName.trim() || !newContent.trim()) return;

    try {
      await fetch('/api/user-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'addTemplate',
          value: { name: newName.trim(), content: newContent.trim() },
        }),
      });
      fetchTemplates();
      setAdding(false);
      setNewName('');
      setNewContent('');
    } catch (error) {
      console.error('Failed to add template:', error);
    }
  };

  const deleteTemplate = async (id: string) => {
    try {
      await fetch('/api/user-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteTemplate', value: id }),
      });
      fetchTemplates();
    } catch (error) {
      console.error('Failed to delete template:', error);
    }
  };

  const copyTemplate = async (content: string, id: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-2xl max-h-[80vh] bg-white dark:bg-zinc-900 rounded-xl shadow-xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
            <FileText size={20} />
            Prompt 模板
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500 text-black text-sm font-medium hover:bg-amber-600 transition-colors"
            >
              <Plus size={16} />
              新建模板
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {adding && (
            <div className="mb-6 p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg space-y-3">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="模板名称"
                className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-lg text-sm focus:outline-none focus:border-amber-500"
                autoFocus
              />
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="Prompt 内容..."
                rows={6}
                className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-lg text-sm focus:outline-none focus:border-amber-500 resize-none font-mono"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setAdding(false); setNewName(''); setNewContent(''); }}
                  className="px-3 py-1.5 rounded-lg bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400 text-sm"
                >
                  取消
                </button>
                <button
                  onClick={addTemplate}
                  disabled={!newName.trim() || !newContent.trim()}
                  className="px-3 py-1.5 rounded-lg bg-green-500 text-white text-sm disabled:opacity-50"
                >
                  保存模板
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-center py-8 text-zinc-500">加载中...</div>
          ) : templates.length === 0 ? (
            <div className="text-center py-8 text-zinc-500">
              <FileText size={48} className="mx-auto mb-4 opacity-50" />
              <p>还没有模板</p>
              <p className="text-sm">点击"新建模板"创建你的第一个 Prompt 模板</p>
            </div>
          ) : (
            <div className="space-y-3">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg border border-zinc-200 dark:border-zinc-700"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-zinc-900 dark:text-white">{template.name}</h3>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => copyTemplate(template.content, template.id)}
                        className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                        title="复制内容"
                      >
                        {copiedId === template.id ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                      </button>
                      {onSelectTemplate && (
                        <button
                          onClick={() => { onSelectTemplate(template.content); onClose(); }}
                          className="px-2 py-1 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 text-xs font-medium hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
                        >
                          使用
                        </button>
                      )}
                      <button
                        onClick={() => deleteTemplate(template.id)}
                        className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-zinc-500 hover:text-red-500 transition-colors"
                        title="删除模板"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  <pre className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap font-mono bg-white dark:bg-zinc-900 p-3 rounded border border-zinc-200 dark:border-zinc-700 max-h-32 overflow-y-auto">
                    {template.content}
                  </pre>
                  <div className="text-xs text-zinc-500 mt-2">
                    创建于 {new Date(template.createdAt).toLocaleDateString('zh-CN')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
