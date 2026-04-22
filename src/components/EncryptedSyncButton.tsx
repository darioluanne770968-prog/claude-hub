'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { RefreshCw, Check, Lock, X, Eye, EyeOff, CloudOff } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface SyncStatus {
  totalSessions: number;
  lastSyncTime: string | null;
}

interface StoredCredentials {
  email: string;
  salt: string;
}

interface EncryptedSyncProgress {
  running: boolean;
  stage: 'idle' | 'preparing' | 'syncing' | 'completed' | 'failed';
  totalSessions: number;
  totalToSync: number;
  startedSessions: number;
  activeSessions: number;
  processedSessions: number;
  sessionsUploaded: number;
  sessionsSkipped: number;
  failedSessions: number;
  messagesUploaded: number;
  currentSessionId: string | null;
  updatedAt: string | null;
  error?: string | null;
}

const CREDENTIALS_KEY = 'claude_hub_encrypted_sync_credentials';
const ENCRYPTED_SYNC_START_TIMEOUT_MS = 20000; // Start request timeout

export default function EncryptedSyncButton() {
  const [mounted, setMounted] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<EncryptedSyncProgress | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [encryptionPassword, setEncryptionPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showEncPassword, setShowEncPassword] = useState(false);

  // Ensure component only renders on client
  useEffect(() => {
    setMounted(true);
  }, []);

  // Load stored credentials on mount
  useEffect(() => {
    if (!mounted) return;

    try {
      const stored = localStorage.getItem(CREDENTIALS_KEY);
      if (stored) {
        const creds: StoredCredentials = JSON.parse(stored);
        setEmail(creds.email);
        setIsLoggedIn(true);
      }
    } catch (err) {
      console.error('Failed to load credentials:', err);
    }

    fetchStatus();
  }, [mounted]);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/cloud-sync');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        setError(null);
      }
    } catch (err) {
      // Silently fail - don't block UI
      console.error('Failed to fetch sync status:', err);
    }
  };

  const fetchSyncProgress = async () => {
    try {
      const res = await fetch('/api/encrypted-sync', { cache: 'no-store' });
      if (!res.ok) return;

      const data = await res.json();
      if (!data || typeof data !== 'object') return;

      setProgress(data as EncryptedSyncProgress);
    } catch {
      // Ignore progress polling failures
    }
  };

  useEffect(() => {
    if (!syncing) return;

    void fetchSyncProgress();
    const timer = window.setInterval(() => {
      void fetchSyncProgress();
    }, 1200);

    return () => {
      window.clearInterval(timer);
    };
  }, [syncing]);

  useEffect(() => {
    if (!syncing || !progress) return;

    if (progress.stage === 'completed' && !progress.running) {
      setSyncing(false);
      setResult({
        success: true,
        message: `加密同步完成：上传会话 ${progress.sessionsUploaded}，跳过 ${progress.sessionsSkipped}，消息 ${progress.messagesUploaded}`,
      });
      if (progress.failedSessions > 0) {
        setError(`部分失败：${progress.failedSessions} 个会话同步失败`);
      } else {
        setError(null);
      }
      void fetchStatus();
      setTimeout(() => setResult(null), 6000);
    } else if (progress.stage === 'failed' && !progress.running) {
      setSyncing(false);
      setError(progress.error || '同步失败');
      setTimeout(() => setResult(null), 5000);
    }
  }, [progress, syncing]);

  // Don't render until mounted (prevents hydration issues)
  if (!mounted) {
    return (
      <button
        disabled
        className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-purple-50 dark:bg-purple-900/20 border-purple-300 dark:border-purple-700 text-purple-600 dark:text-purple-400 opacity-50"
      >
        <Lock size={18} />
        <span className="text-sm">加密同步</span>
      </button>
    );
  }

  const generateSalt = (): string => {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  };

  const handleSync = async () => {
    if (!isLoggedIn) {
      setShowModal(true);
      return;
    }

    // If logged in but no encryption password entered yet
    if (!encryptionPassword) {
      setShowModal(true);
      return;
    }

    await performSync();
  };

  const performSync = async () => {
    setSyncing(true);
    setResult(null);
    setError(null);
    setProgress(null);
    setShowModal(false);

    let timeoutId: number | undefined;
    let started = false;
    try {
      // Get or generate salt
      let salt: string;
      const stored = localStorage.getItem(CREDENTIALS_KEY);
      if (stored) {
        const creds: StoredCredentials = JSON.parse(stored);
        salt = creds.salt;
      } else {
        salt = generateSalt();
      }

      const controller = new AbortController();
      timeoutId = window.setTimeout(() => controller.abort(), ENCRYPTED_SYNC_START_TIMEOUT_MS);

      const res = await fetch('/api/encrypted-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          email,
          password,
          encryptionPassword,
          salt,
        }),
      });

      const data = await res.json().catch(() => ({} as Record<string, unknown>));

      if (res.ok && data.success !== false) {
        // Save credentials (not passwords, just email and salt)
        localStorage.setItem(CREDENTIALS_KEY, JSON.stringify({ email, salt }));
        setIsLoggedIn(true);
        setResult({
          success: true,
          message: typeof data.message === 'string' ? data.message : '已开始加密同步，正在后台执行',
        });
        started = true;
        void fetchSyncProgress();
      } else {
        const errorMessage = typeof data.error === 'string'
          ? data.error
          : typeof data.details === 'string'
          ? data.details
          : typeof data.message === 'string'
          ? data.message
          : '同步失败';
        setError(normalizeSyncError(errorMessage));
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('启动同步请求超时（20秒），请检查网络后重试');
      } else {
        setError('网络错误，同步失败');
      }
    } finally {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      setPassword(''); // Clear password for security
      setEncryptionPassword('');
      if (!started) {
        setSyncing(false);
      }
      setTimeout(() => setResult(null), 5000);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(CREDENTIALS_KEY);
    setIsLoggedIn(false);
    setEmail('');
    setPassword('');
    setEncryptionPassword('');
  };

  const normalizeSyncError = (message: string): string => {
    if (message.includes('Invalid login credentials')) {
      return '登录失败：邮箱或密码错误';
    }
    if (message.includes('非 JSON')) {
      return '登录服务返回异常页面，请检查网络/VPN/代理后重试';
    }
    return message;
  };

  const getSyncingLabel = (): string => {
    if (!progress) return '加密同步中...';
    if (progress.stage === 'preparing') return '准备同步...';
    if (progress.totalToSync > 0) {
      const done = Math.min(progress.processedSessions, progress.totalToSync);
      const active = Math.max(0, progress.activeSessions || 0);
      return active > 0
        ? `同步中 ${done}/${progress.totalToSync} (${active}进行中)`
        : `同步中 ${done}/${progress.totalToSync}`;
    }
    return '检查差异中...';
  };

  const getSyncingDetail = (): string => {
    if (!progress) return '正在同步，请稍候...';

    if (progress.stage === 'preparing') {
      return '正在读取本地会话并检查增量差异...';
    }

    if (progress.totalToSync === 0 && progress.totalSessions > 0) {
      return `共 ${progress.totalSessions} 个会话，正在计算需要同步的会话...`;
    }

    const current = progress.currentSessionId
      ? `，当前 ${progress.currentSessionId.slice(0, 8)}...`
      : '';

    return `总 ${progress.totalSessions}，待同步 ${progress.totalToSync}，已处理 ${progress.processedSessions}，已上传会话 ${progress.sessionsUploaded}，已上传消息 ${progress.messagesUploaded}，已跳过 ${progress.sessionsSkipped}，并发中 ${Math.max(0, progress.activeSessions || 0)}${current}`;
  };

  return (
    <>
      <div className="relative">
        <button
          onClick={handleSync}
          disabled={syncing}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
            syncing
              ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-400'
              : error
              ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30'
              : result?.success
              ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700 text-green-600 dark:text-green-400'
              : 'bg-purple-50 dark:bg-purple-900/20 border-purple-300 dark:border-purple-700 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/30'
          }`}
          title={(() => {
            if (!status?.lastSyncTime) return '点击进行加密同步';
            try {
              return `上次同步: ${formatDistanceToNow(new Date(status.lastSyncTime), { addSuffix: true, locale: zhCN })}`;
            } catch {
              return '点击进行加密同步';
            }
          })()}
        >
          {syncing ? (
            <>
              <RefreshCw size={18} className="animate-spin" />
              <span className="text-sm">{getSyncingLabel()}</span>
            </>
          ) : error ? (
            <>
              <CloudOff size={18} />
              <span className="text-sm">同步失败</span>
            </>
          ) : result?.success ? (
            <>
              <Check size={18} />
              <span className="text-sm">已同步</span>
            </>
          ) : (
            <>
              <Lock size={18} />
              <span className="text-sm">加密同步</span>
              {isLoggedIn && <span className="text-xs opacity-70">🔐</span>}
            </>
          )}
        </button>

        {(syncing || result || error) && (
          <div className={`absolute top-full mt-2 right-0 z-50 px-3 py-2 rounded-lg shadow-lg text-sm max-w-xs ${
            syncing
              ? 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-200'
              : error
              ? 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200'
              : 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200'
          }`}>
            {syncing ? getSyncingDetail() : error || result?.message}
          </div>
        )}
      </div>

      {/* Login Modal - using Portal to render outside header */}
      {showModal && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black/50 flex items-start justify-center pt-20 pb-10 overflow-y-auto"
          onClick={(e) => e.target === e.currentTarget && setShowModal(false)}
        >
          <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-zinc-800 dark:text-zinc-100">
                🔐 加密同步
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X size={24} />
              </button>
            </div>

            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
              使用端到端加密保护您的数据。您的会话内容将在本地加密后上传，我们无法查看您的数据。
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  邮箱
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-zinc-700 border-zinc-300 dark:border-zinc-600 text-zinc-800 dark:text-zinc-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  账号密码
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="登录密码"
                    className="w-full px-3 py-2 pr-10 border rounded-lg bg-white dark:bg-zinc-700 border-zinc-300 dark:border-zinc-600 text-zinc-800 dark:text-zinc-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  加密密码
                </label>
                <div className="relative">
                  <input
                    type={showEncPassword ? 'text' : 'password'}
                    value={encryptionPassword}
                    onChange={(e) => setEncryptionPassword(e.target.value)}
                    placeholder="用于加密数据的密码（与手机端相同）"
                    className="w-full px-3 py-2 pr-10 border rounded-lg bg-white dark:bg-zinc-700 border-zinc-300 dark:border-zinc-600 text-zinc-800 dark:text-zinc-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEncPassword(!showEncPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400"
                  >
                    {showEncPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <p className="text-xs text-zinc-400 mt-1">
                  请使用与手机端相同的加密密码，否则无法解密数据
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              {isLoggedIn && (
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                >
                  退出登录
                </button>
              )}
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"
              >
                取消
              </button>
              <button
                onClick={performSync}
                disabled={!email || !password || !encryptionPassword}
                className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                开始同步
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
