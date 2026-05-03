'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Smartphone, Loader2, Copy, ExternalLink, Check, X, RotateCw } from 'lucide-react';

interface Props {
  sessionId: string;
  projectPath?: string;
}

export default function RemoteControlButton({ sessionId }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pane, setPane] = useState<string | null>(null);
  const [active, setActive] = useState(false);
  const [copied, setCopied] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const r = await fetch(`/api/remote-control?sessionId=${encodeURIComponent(sessionId)}`);
      const data = await r.json();
      setActive(!!data.active);
      setUrl(data.url || null);
    } catch {
      // ignore
    }
  }, [sessionId]);

  useEffect(() => {
    if (!open) return;
    refreshStatus();
  }, [open, refreshStatus]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const start = async () => {
    setLoading(true);
    setError(null);
    setPane(null);
    setUrl(null);
    try {
      const res = await fetch('/api/remote-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '启动失败');
        if (data.pane) setPane(data.pane);
      } else {
        setUrl(data.url);
        setActive(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '请求失败');
    } finally {
      setLoading(false);
    }
  };

  const stop = async () => {
    setLoading(true);
    try {
      await fetch(`/api/remote-control?sessionId=${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
      });
      setActive(false);
      setUrl(null);
      setPane(null);
      setError(null);
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(!open);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={toggle}
        className="p-1.5 rounded-md bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-400 dark:hover:border-blue-500/50 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-all"
        title="接管到 Claude App（remote-control）"
      >
        <Smartphone size={14} />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1 w-80 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg z-50 overflow-hidden">
          <div className="px-3 py-2 bg-blue-50 dark:bg-blue-500/10 border-b border-blue-200 dark:border-blue-500/30">
            <div className="text-xs text-blue-700 dark:text-blue-400 font-medium">📱 接管到 Claude App</div>
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-snug">
              本机后台 tmux 起会话 + 自动 /remote-control，给你一个 Claude App 链接
            </div>
          </div>

          {!loading && !url && !error && !active && (
            <button
              onClick={start}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <ExternalLink size={14} />
              <span>启动 remote-control</span>
            </button>
          )}

          {loading && (
            <div className="px-3 py-3 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              <Loader2 size={14} className="animate-spin" />
              <span>正在启动 Claude 并等待 URL（10–25 秒）...</span>
            </div>
          )}

          {url && !loading && (
            <div className="p-2 space-y-1.5">
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors"
              >
                <ExternalLink size={14} />
                <span>在 Claude App 打开</span>
              </a>
              <button
                onClick={copy}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
              >
                {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                <span>{copied ? '已复制!' : '复制链接'}</span>
              </button>
              <div className="px-3 py-1.5 text-[10px] text-zinc-500 dark:text-zinc-400 break-all font-mono">
                {url}
              </div>
              <button
                onClick={stop}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-md transition-colors border-t border-zinc-200 dark:border-zinc-700 mt-1 pt-2"
              >
                <X size={14} />
                <span>结束 tmux 会话</span>
              </button>
            </div>
          )}

          {!loading && !url && active && (
            <div className="p-2 space-y-1.5">
              <div className="px-3 py-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 rounded-md">
                tmux 会话已在跑但抓不到 URL（可能滚出屏外了）。重新启动一次会刷新。
              </div>
              <button
                onClick={start}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
              >
                <RotateCw size={14} />
                <span>重新启动</span>
              </button>
              <button
                onClick={stop}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-md transition-colors"
              >
                <X size={14} />
                <span>结束 tmux 会话</span>
              </button>
            </div>
          )}

          {error && !loading && (
            <div className="p-2 space-y-1.5">
              <div className="px-3 py-2 text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-md">
                {error}
              </div>
              {pane && (
                <details className="px-3 py-1.5 text-[10px] text-zinc-500 dark:text-zinc-400">
                  <summary className="cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-300">
                    查看 tmux 输出尾部
                  </summary>
                  <pre className="mt-1.5 p-2 bg-zinc-100 dark:bg-zinc-800 rounded overflow-x-auto whitespace-pre-wrap break-all max-h-40">
                    {pane}
                  </pre>
                </details>
              )}
              <button
                onClick={start}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
              >
                <RotateCw size={14} />
                <span>重试</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
