'use client';

import { useState, useRef, useEffect } from 'react';
import { Terminal, Copy, ExternalLink, Check, ChevronDown, Server } from 'lucide-react';

interface RemoteSource {
  type: 'remote';
  hostId: string;
  hostName: string;
}

interface TerminalButtonProps {
  sessionId: string;
  provider?: 'claude' | 'codex';
  projectPath: string;
  variant?: 'icon' | 'full';
  className?: string;
  // Remote session info
  source?: RemoteSource;
}

export default function TerminalButton({
  sessionId,
  provider = 'claude',
  projectPath,
  variant = 'icon',
  className = '',
  source,
}: TerminalButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [opening, setOpening] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isRemote = source?.type === 'remote';
  const isCodex = provider === 'codex';
  const rawSessionId = isCodex && sessionId.startsWith('codex-')
    ? sessionId.slice('codex-'.length)
    : sessionId;

  // Default fallback while the server-resolved command is loading. The server
  // may rewrite the path if the session was synced from another Mac with a
  // different username.
  const fallbackCommand = isCodex
    ? `cd "${projectPath}" && codex resume ${rawSessionId}`
    : `cd "${projectPath}" && claude -r ${sessionId}`;
  const [command, setCommand] = useState(fallbackCommand);

  // For remote sessions, include SSH command
  const remoteCommand = isRemote ? `ssh <user>@<host> -t '${command}'` : command;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Ask the server for the actual command to run / show. The server applies
  // path-remap (e.g. /Users/hui → /Users/haihui) when needed.
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ sessionId, projectPath, provider });
    if (source?.type === 'remote') params.set('hostId', source.hostId);
    fetch(`/api/terminal?${params.toString()}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!cancelled && data?.command) setCommand(data.command);
      })
      .catch(() => { /* fall back to local default */ });
    return () => { cancelled = true; };
  }, [sessionId, projectPath, provider, source]);

  const handleOpenTerminal = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpening(true);

    try {
      const res = await fetch('/api/terminal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          projectPath,
          provider,
          // Pass remote info if this is a remote session
          hostId: source?.hostId,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to open terminal');
      }

      setIsOpen(false);
    } catch (error) {
      console.error('Failed to open terminal:', error);
      alert('打开终端失败，请手动复制命令');
    } finally {
      setOpening(false);
    }
  };

  const handleCopyCommand = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const toggleDropdown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  if (variant === 'icon') {
    return (
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={toggleDropdown}
          className={`p-1.5 rounded-md bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-green-600 dark:hover:text-green-400 hover:border-green-400 dark:hover:border-green-500/50 hover:bg-green-50 dark:hover:bg-green-500/10 transition-all ${className}`}
          title={isRemote ? `SSH到 ${source?.hostName} 恢复会话` : `在终端中恢复${isCodex ? ' Codex' : ''}会话`}
        >
          {isRemote ? <Server size={14} /> : <Terminal size={14} />}
        </button>

        {isOpen && (
          <div className="absolute top-full right-0 mt-1 w-56 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg z-50 overflow-hidden">
            {isRemote && (
              <div className="px-3 py-1.5 bg-amber-100 dark:bg-amber-500/20 border-b border-amber-200 dark:border-amber-500/30">
                <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">远程: {source?.hostName}</span>
              </div>
            )}
            <button
              onClick={handleOpenTerminal}
              disabled={opening}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
            >
              <ExternalLink size={14} />
              <span>{opening ? '正在打开...' : isRemote ? 'SSH到远程终端' : '在终端中打开'}</span>
            </button>
            <button
              onClick={handleCopyCommand}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
              <span>{copied ? '已复制!' : '复制命令'}</span>
            </button>
            <div className="border-t border-zinc-200 dark:border-zinc-700 px-3 py-2">
              <code className="text-xs text-zinc-500 dark:text-zinc-400 break-all">
                {isCodex ? 'codex resume' : 'claude --resume'} {rawSessionId.slice(0, 8)}...
              </code>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Full variant with text
  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={toggleDropdown}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
          isRemote
            ? 'bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20'
            : 'bg-green-500/10 border border-green-500/30 text-green-600 dark:text-green-400 hover:bg-green-500/20'
        } transition-all ${className}`}
      >
        {isRemote ? <Server size={16} /> : <Terminal size={16} />}
        <span className="text-sm font-medium">{isRemote ? `SSH恢复 (${source?.hostName})` : `在终端中恢复${isCodex ? ' Codex' : ''}`}</span>
        <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 w-72 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg z-50 overflow-hidden">
          {isRemote && (
            <div className="px-3 py-2 bg-amber-100 dark:bg-amber-500/20 border-b border-amber-200 dark:border-amber-500/30">
              <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                远程会话: {source?.hostName}
              </span>
            </div>
          )}
          <button
            onClick={handleOpenTerminal}
            disabled={opening}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
          >
            <ExternalLink size={16} />
            <span>{opening ? '正在打开...' : isRemote ? 'SSH到远程终端恢复' : '直接在终端中打开'}</span>
          </button>
          <button
            onClick={handleCopyCommand}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
            <span>{copied ? '命令已复制到剪贴板!' : '复制恢复命令'}</span>
          </button>
          <div className="border-t border-zinc-200 dark:border-zinc-700 px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50">
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">命令：</p>
            <code className="text-xs text-zinc-600 dark:text-zinc-300 break-all font-mono">
              {command}
            </code>
          </div>
        </div>
      )}
    </div>
  );
}
