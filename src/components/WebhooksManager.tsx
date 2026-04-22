'use client';

import { useState, useEffect } from 'react';
import { X, Plus, Trash2, RefreshCw, CheckCircle, XCircle, Bell, Eye, EyeOff, Copy, Check } from 'lucide-react';

interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  enabled: boolean;
  secret: string | null;
  createdAt: string;
}

interface WebhookLog {
  id: number;
  event: string;
  responseStatus: number | null;
  success: boolean;
  createdAt: string;
}

interface WebhooksManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

const WEBHOOK_EVENTS = [
  { value: 'session.created', label: '会话创建' },
  { value: 'session.updated', label: '会话更新' },
  { value: 'session.deleted', label: '会话删除' },
  { value: 'session.favorited', label: '会话收藏' },
  { value: 'session.archived', label: '会话归档' },
  { value: 'tag.added', label: '标签添加' },
  { value: 'tag.removed', label: '标签移除' },
];

export default function WebhooksManager({ isOpen, onClose }: WebhooksManagerProps) {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedWebhook, setSelectedWebhook] = useState<Webhook | null>(null);
  const [webhookLogs, setWebhookLogs] = useState<WebhookLog[]>([]);
  const [showSecret, setShowSecret] = useState(false);
  const [copied, setCopied] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    events: [] as string[],
    secret: '',
  });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchWebhooks();
    }
  }, [isOpen]);

  const fetchWebhooks = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/webhooks');
      const data = await res.json();
      setWebhooks(data.webhooks || []);
    } catch (error) {
      console.error('Failed to fetch webhooks:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchWebhookDetails = async (id: string) => {
    try {
      const res = await fetch(`/api/webhooks/${id}`);
      const data = await res.json();
      setSelectedWebhook(data.webhook);
      setWebhookLogs(data.logs || []);
    } catch (error) {
      console.error('Failed to fetch webhook details:', error);
    }
  };

  const handleCreateWebhook = async () => {
    if (!formData.name || !formData.url || formData.events.length === 0) {
      setFormError('请填写所有必填字段');
      return;
    }

    setSaving(true);
    setFormError('');

    try {
      const res = await fetch('/api/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        setFormError(data.error || '创建失败');
        return;
      }

      await fetchWebhooks();
      setShowForm(false);
      setFormData({ name: '', url: '', events: [], secret: '' });
    } catch (error) {
      setFormError('创建失败');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnabled = async (webhook: Webhook) => {
    try {
      await fetch(`/api/webhooks/${webhook.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !webhook.enabled }),
      });
      await fetchWebhooks();
    } catch (error) {
      console.error('Failed to toggle webhook:', error);
    }
  };

  const handleDeleteWebhook = async (id: string) => {
    if (!confirm('确定要删除这个 Webhook 吗？')) return;

    try {
      await fetch(`/api/webhooks/${id}`, { method: 'DELETE' });
      await fetchWebhooks();
      if (selectedWebhook?.id === id) {
        setSelectedWebhook(null);
      }
    } catch (error) {
      console.error('Failed to delete webhook:', error);
    }
  };

  const handleEventToggle = (event: string) => {
    setFormData(prev => ({
      ...prev,
      events: prev.events.includes(event)
        ? prev.events.filter(e => e !== event)
        : [...prev.events, event],
    }));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-4xl max-h-[90vh] bg-white dark:bg-zinc-900 rounded-xl shadow-xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
            <Bell size={20} />
            Webhooks 管理
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Webhooks list */}
          <div className="w-1/2 border-r border-zinc-200 dark:border-zinc-800 flex flex-col">
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
              <button
                onClick={() => setShowForm(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black font-medium rounded-lg transition-colors"
              >
                <Plus size={18} />
                添加 Webhook
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw size={20} className="animate-spin text-zinc-400" />
                </div>
              ) : webhooks.length === 0 ? (
                <div className="text-center py-8 text-zinc-500">
                  还没有 Webhook
                </div>
              ) : (
                webhooks.map(webhook => (
                  <div
                    key={webhook.id}
                    onClick={() => fetchWebhookDetails(webhook.id)}
                    className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                      selectedWebhook?.id === webhook.id
                        ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                        : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-zinc-900 dark:text-white">
                        {webhook.name}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleToggleEnabled(webhook); }}
                          className={`px-2 py-1 rounded text-xs ${
                            webhook.enabled
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-600'
                              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                          }`}
                        >
                          {webhook.enabled ? '启用' : '禁用'}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteWebhook(webhook.id); }}
                          className="p-1 text-zinc-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="text-sm text-zinc-500 truncate">{webhook.url}</div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {webhook.events.map(event => (
                        <span
                          key={event}
                          className="px-1.5 py-0.5 rounded text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                        >
                          {WEBHOOK_EVENTS.find(e => e.value === event)?.label || event}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Webhook details / Form */}
          <div className="w-1/2 flex flex-col">
            {showForm ? (
              <div className="p-6 space-y-4">
                <h3 className="text-lg font-medium text-zinc-900 dark:text-white">新建 Webhook</h3>

                {formError && (
                  <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 text-sm">
                    {formError}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    名称 *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-lg focus:outline-none focus:border-amber-500"
                    placeholder="我的 Webhook"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    URL *
                  </label>
                  <input
                    type="url"
                    value={formData.url}
                    onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-lg focus:outline-none focus:border-amber-500"
                    placeholder="https://example.com/webhook"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    密钥 (可选)
                  </label>
                  <input
                    type="text"
                    value={formData.secret}
                    onChange={(e) => setFormData({ ...formData, secret: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-lg focus:outline-none focus:border-amber-500"
                    placeholder="用于验证请求的密钥"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    事件 *
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {WEBHOOK_EVENTS.map(event => (
                      <label
                        key={event.value}
                        className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                          formData.events.includes(event.value)
                            ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                            : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={formData.events.includes(event.value)}
                          onChange={() => handleEventToggle(event.value)}
                          className="sr-only"
                        />
                        <span className="text-sm text-zinc-700 dark:text-zinc-300">
                          {event.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => { setShowForm(false); setFormError(''); }}
                    className="flex-1 px-4 py-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleCreateWebhook}
                    disabled={saving}
                    className="flex-1 px-4 py-2 bg-amber-500 text-black font-medium rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors"
                  >
                    {saving ? '创建中...' : '创建'}
                  </button>
                </div>
              </div>
            ) : selectedWebhook ? (
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <h3 className="text-lg font-medium text-zinc-900 dark:text-white">
                  {selectedWebhook.name}
                </h3>

                <div className="space-y-3">
                  <div>
                    <label className="text-sm text-zinc-500">URL</label>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="flex-1 px-3 py-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-sm break-all">
                        {selectedWebhook.url}
                      </code>
                      <button
                        onClick={() => copyToClipboard(selectedWebhook.url)}
                        className="p-2 text-zinc-400 hover:text-zinc-600 transition-colors"
                      >
                        {copied ? <Check size={16} /> : <Copy size={16} />}
                      </button>
                    </div>
                  </div>

                  {selectedWebhook.secret && (
                    <div>
                      <label className="text-sm text-zinc-500">密钥</label>
                      <div className="flex items-center gap-2 mt-1">
                        <code className="flex-1 px-3 py-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-sm">
                          {showSecret ? selectedWebhook.secret : '••••••••••••'}
                        </code>
                        <button
                          onClick={() => setShowSecret(!showSecret)}
                          className="p-2 text-zinc-400 hover:text-zinc-600 transition-colors"
                        >
                          {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="text-sm text-zinc-500">事件</label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {selectedWebhook.events.map(event => (
                        <span
                          key={event}
                          className="px-2 py-1 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-sm"
                        >
                          {WEBHOOK_EVENTS.find(e => e.value === event)?.label || event}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-zinc-200 dark:border-zinc-700">
                  <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
                    最近调用记录
                  </h4>
                  {webhookLogs.length === 0 ? (
                    <div className="text-center py-4 text-zinc-500 text-sm">
                      暂无调用记录
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {webhookLogs.map(log => (
                        <div
                          key={log.id}
                          className="flex items-center gap-3 p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50"
                        >
                          {log.success ? (
                            <CheckCircle size={16} className="text-green-500" />
                          ) : (
                            <XCircle size={16} className="text-red-500" />
                          )}
                          <span className="text-sm text-zinc-600 dark:text-zinc-400">
                            {WEBHOOK_EVENTS.find(e => e.value === log.event)?.label || log.event}
                          </span>
                          <span className="text-xs text-zinc-500">
                            {log.responseStatus && `HTTP ${log.responseStatus}`}
                          </span>
                          <span className="text-xs text-zinc-400 ml-auto">
                            {new Date(log.createdAt).toLocaleString('zh-CN')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-zinc-500">
                选择一个 Webhook 查看详情
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
