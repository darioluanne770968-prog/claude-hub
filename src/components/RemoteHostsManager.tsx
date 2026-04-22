'use client';

import { useState, useEffect } from 'react';
import {
  Server,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Loader2,
  Monitor,
  Laptop,
  Wifi,
  WifiOff,
} from 'lucide-react';

interface RemoteHost {
  id: string;
  name: string;
  hostname: string;
  port: number;
  username: string;
  privateKeyPath: string;
  claudePath: string;
  enabled: boolean;
  os: 'macos' | 'linux' | 'windows';
}

interface RemoteHostsManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onHostsChanged: () => void;
}

export default function RemoteHostsManager({
  isOpen,
  onClose,
  onHostsChanged,
}: RemoteHostsManagerProps) {
  const [hosts, setHosts] = useState<RemoteHost[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingHost, setEditingHost] = useState<Partial<RemoteHost> | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ hostId: string; success: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchHosts = async () => {
    try {
      const res = await fetch('/api/remote-hosts');
      if (res.ok) {
        const data = await res.json();
        setHosts(data);
      }
    } catch (error) {
      console.error('Failed to fetch hosts:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchHosts();
    }
  }, [isOpen]);

  const handleTest = async (host: RemoteHost) => {
    setTesting(host.id);
    setTestResult(null);

    try {
      const res = await fetch('/api/remote-hosts/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(host),
      });

      const data = await res.json();
      setTestResult({
        hostId: host.id,
        success: data.success,
        message: data.message,
      });
    } catch (error) {
      setTestResult({
        hostId: host.id,
        success: false,
        message: '连接测试失败',
      });
    } finally {
      setTesting(null);
    }
  };

  const handleSave = async () => {
    if (!editingHost) return;

    setSaving(true);
    try {
      const isNew = !editingHost.id;
      const res = await fetch('/api/remote-hosts', {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingHost),
      });

      if (res.ok) {
        await fetchHosts();
        setEditingHost(null);
        onHostsChanged();
      } else {
        const error = await res.json();
        alert(error.error || '保存失败');
      }
    } catch (error) {
      alert('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个远程主机吗？')) return;

    try {
      const res = await fetch(`/api/remote-hosts?id=${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        await fetchHosts();
        onHostsChanged();
      }
    } catch (error) {
      alert('删除失败');
    }
  };

  const handleToggleEnabled = async (host: RemoteHost) => {
    try {
      const res = await fetch('/api/remote-hosts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: host.id, enabled: !host.enabled }),
      });

      if (res.ok) {
        await fetchHosts();
        onHostsChanged();
      }
    } catch (error) {
      alert('更新失败');
    }
  };

  if (!isOpen) return null;

  const getOsIcon = (os: string) => {
    switch (os) {
      case 'windows':
        return <Monitor size={16} />;
      case 'linux':
        return <Server size={16} />;
      default:
        return <Laptop size={16} />;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-700">
          <div className="flex items-center gap-3">
            <Server className="text-amber-500" size={24} />
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">远程主机管理</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="animate-spin text-zinc-400" size={32} />
            </div>
          ) : editingHost ? (
            /* Edit/Add Form */
            <div className="space-y-4">
              <h3 className="font-medium text-zinc-900 dark:text-white">
                {editingHost.id ? '编辑主机' : '添加新主机'}
              </h3>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-zinc-600 dark:text-zinc-400 mb-1">
                    名称 *
                  </label>
                  <input
                    type="text"
                    value={editingHost.name || ''}
                    onChange={(e) => setEditingHost({ ...editingHost, name: e.target.value })}
                    placeholder="例如: M1 Pro MacBook"
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm text-zinc-600 dark:text-zinc-400 mb-1">
                    操作系统
                  </label>
                  <select
                    value={editingHost.os || 'macos'}
                    onChange={(e) => setEditingHost({ ...editingHost, os: e.target.value as RemoteHost['os'] })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm"
                  >
                    <option value="macos">macOS</option>
                    <option value="linux">Linux</option>
                    <option value="windows">Windows</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-zinc-600 dark:text-zinc-400 mb-1">
                    主机地址 *
                  </label>
                  <input
                    type="text"
                    value={editingHost.hostname || ''}
                    onChange={(e) => setEditingHost({ ...editingHost, hostname: e.target.value })}
                    placeholder="例如: 192.168.1.100 或 hostname.local"
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm text-zinc-600 dark:text-zinc-400 mb-1">
                    SSH 端口
                  </label>
                  <input
                    type="number"
                    value={editingHost.port || 22}
                    onChange={(e) => setEditingHost({ ...editingHost, port: parseInt(e.target.value) || 22 })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm text-zinc-600 dark:text-zinc-400 mb-1">
                    用户名 *
                  </label>
                  <input
                    type="text"
                    value={editingHost.username || ''}
                    onChange={(e) => setEditingHost({ ...editingHost, username: e.target.value })}
                    placeholder="SSH 用户名"
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm text-zinc-600 dark:text-zinc-400 mb-1">
                    私钥路径 *
                  </label>
                  <input
                    type="text"
                    value={editingHost.privateKeyPath || ''}
                    onChange={(e) => setEditingHost({ ...editingHost, privateKeyPath: e.target.value })}
                    placeholder="~/.ssh/id_rsa"
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm text-zinc-600 dark:text-zinc-400 mb-1">
                    Claude 数据目录
                  </label>
                  <input
                    type="text"
                    value={editingHost.claudePath || ''}
                    onChange={(e) => setEditingHost({ ...editingHost, claudePath: e.target.value })}
                    placeholder="~/.claude"
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm"
                  />
                  <p className="text-xs text-zinc-500 mt-1">
                    Windows 默认: C:\Users\用户名\.claude
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  onClick={() => setEditingHost(null)}
                  className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg"
                >
                  取消
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !editingHost.name || !editingHost.hostname || !editingHost.username || !editingHost.privateKeyPath}
                  className="px-4 py-2 text-sm bg-amber-500 hover:bg-amber-600 text-black font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  保存
                </button>
              </div>
            </div>
          ) : (
            /* Host List */
            <div className="space-y-4">
              {hosts.length === 0 ? (
                <div className="text-center py-12 text-zinc-500">
                  <Server size={48} className="mx-auto mb-4 opacity-50" />
                  <p>还没有配置远程主机</p>
                  <p className="text-sm mt-1">点击下方按钮添加你的其他电脑</p>
                </div>
              ) : (
                hosts.map((host) => (
                  <div
                    key={host.id}
                    className={`p-4 rounded-lg border ${
                      host.enabled
                        ? 'border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50'
                        : 'border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="text-zinc-500 dark:text-zinc-400">
                          {getOsIcon(host.os)}
                        </div>
                        <div>
                          <div className="font-medium text-zinc-900 dark:text-white flex items-center gap-2">
                            {host.name}
                            {host.enabled ? (
                              <Wifi size={14} className="text-green-500" />
                            ) : (
                              <WifiOff size={14} className="text-zinc-400" />
                            )}
                          </div>
                          <div className="text-sm text-zinc-500">
                            {host.username}@{host.hostname}:{host.port}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {testResult?.hostId === host.id && (
                          <span
                            className={`text-xs px-2 py-1 rounded ${
                              testResult.success
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                                : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                            }`}
                          >
                            {testResult.message}
                          </span>
                        )}

                        <button
                          onClick={() => handleTest(host)}
                          disabled={testing === host.id}
                          className="p-2 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 disabled:opacity-50"
                          title="测试连接"
                        >
                          {testing === host.id ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Check size={16} />
                          )}
                        </button>

                        <button
                          onClick={() => handleToggleEnabled(host)}
                          className={`p-2 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 ${
                            host.enabled ? 'text-green-500' : 'text-zinc-400'
                          }`}
                          title={host.enabled ? '禁用' : '启用'}
                        >
                          {host.enabled ? <Wifi size={16} /> : <WifiOff size={16} />}
                        </button>

                        <button
                          onClick={() => setEditingHost(host)}
                          className="p-2 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500"
                          title="编辑"
                        >
                          <Edit2 size={16} />
                        </button>

                        <button
                          onClick={() => handleDelete(host.id)}
                          className="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500"
                          title="删除"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}

              <button
                onClick={() =>
                  setEditingHost({
                    name: '',
                    hostname: '',
                    port: 22,
                    username: '',
                    privateKeyPath: '~/.ssh/id_rsa',
                    claudePath: '~/.claude',
                    enabled: true,
                    os: 'macos',
                  })
                }
                className="w-full py-3 border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-500 hover:border-amber-500 hover:text-amber-500 transition-colors flex items-center justify-center gap-2"
              >
                <Plus size={20} />
                添加远程主机
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50">
          <p className="text-xs text-zinc-500">
            提示: 确保远程主机已开启 SSH 服务，且本机的公钥已添加到远程主机的 authorized_keys 中
          </p>
        </div>
      </div>
    </div>
  );
}
