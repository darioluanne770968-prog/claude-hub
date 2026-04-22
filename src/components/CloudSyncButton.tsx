'use client';

import { useState, useEffect } from 'react';
import { Cloud, CloudOff, RefreshCw, Check } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface SyncStatus {
  totalSessions: number;
  lastSyncTime: string | null;
}

export default function CloudSyncButton() {
  const [mounted, setMounted] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Ensure component only renders on client
  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch sync status on mount
  useEffect(() => {
    if (mounted) {
      fetchStatus();
    }
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

  // Helper to safely format time
  const getTimeTitle = () => {
    if (!status?.lastSyncTime) return '点击同步到云端';
    try {
      return `上次同步: ${formatDistanceToNow(new Date(status.lastSyncTime), { addSuffix: true, locale: zhCN })}`;
    } catch {
      return '点击同步到云端';
    }
  };

  // Don't render until mounted (prevents hydration issues)
  if (!mounted) {
    return (
      <button
        disabled
        className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 opacity-50"
      >
        <Cloud size={18} />
        <span className="text-sm">云同步</span>
      </button>
    );
  }

  const handleSync = async () => {
    setSyncing(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch('/api/cloud-sync', { method: 'POST' });
      const data = await res.json();

      if (res.ok) {
        setResult({ success: true, message: data.message });
        fetchStatus(); // Refresh status after sync
      } else {
        setError(data.error || 'Sync failed');
      }
    } catch (err) {
      setError('网络错误，同步失败');
    } finally {
      setSyncing(false);
      // Clear result after 5 seconds
      setTimeout(() => setResult(null), 5000);
    }
  };

  return (
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
            : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700'
        }`}
        title={getTimeTitle()}
      >
        {syncing ? (
          <>
            <RefreshCw size={18} className="animate-spin" />
            <span className="text-sm">同步中...</span>
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
            <Cloud size={18} />
            <span className="text-sm">云同步</span>
            {status && status.totalSessions > 0 && (
              <span className="text-xs text-zinc-400 dark:text-zinc-500">
                ({status.totalSessions})
              </span>
            )}
          </>
        )}
      </button>

      {/* Tooltip with details */}
      {(result || error) && (
        <div className={`absolute top-full mt-2 right-0 z-50 px-3 py-2 rounded-lg shadow-lg text-sm whitespace-nowrap ${
          error
            ? 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200'
            : 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200'
        }`}>
          {error || result?.message}
        </div>
      )}
    </div>
  );
}
