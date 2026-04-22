'use client';

import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface ShortcutConfig {
  onToggleTheme?: () => void;
  onOpenSearch?: () => void;
  onRefresh?: () => void;
  onBack?: () => void;
}

export function useKeyboardShortcuts(config: ShortcutConfig = {}) {
  const router = useRouter();

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't trigger shortcuts when typing in input fields
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      // Allow Escape to work even in inputs
      if (e.key !== 'Escape') {
        return;
      }
    }

    // Cmd/Ctrl + K: Open search (handled by GlobalSearch component)
    // Already implemented in GlobalSearch

    // Escape: Go back or close modals
    if (e.key === 'Escape') {
      config.onBack?.();
    }

    // T: Toggle theme
    if (e.key === 't' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      config.onToggleTheme?.();
    }

    // R: Refresh (when not in input)
    if (e.key === 'r' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      config.onRefresh?.();
    }

    // ?: Show help
    if (e.key === '?' && e.shiftKey) {
      e.preventDefault();
      showShortcutsHelp();
    }

    // G then H: Go home
    if (e.key === 'h' && !e.metaKey && !e.ctrlKey) {
      router.push('/');
    }

    // G then S: Go to stats
    if (e.key === 's' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      // Don't navigate if we're already on the stats page
      if (!window.location.pathname.includes('/stats')) {
        router.push('/stats');
      }
    }

  }, [config, router]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

function showShortcutsHelp() {
  const shortcuts = [
    { key: '⌘K', desc: '全局搜索' },
    { key: 'T', desc: '切换主题' },
    { key: 'R', desc: '刷新数据' },
    { key: 'S', desc: '打开统计' },
    { key: 'H', desc: '返回首页' },
    { key: 'Esc', desc: '返回/关闭' },
    { key: '?', desc: '显示快捷键帮助' },
  ];

  // Create a simple modal
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm';
  overlay.onclick = () => overlay.remove();

  const modal = document.createElement('div');
  modal.className = 'bg-white dark:bg-zinc-900 rounded-xl p-6 shadow-xl border border-zinc-200 dark:border-zinc-700 max-w-sm';
  modal.onclick = (e) => e.stopPropagation();

  modal.innerHTML = `
    <h2 class="text-lg font-bold text-zinc-900 dark:text-white mb-4">⌨️ 快捷键</h2>
    <div class="space-y-2">
      ${shortcuts.map(s => `
        <div class="flex items-center justify-between">
          <span class="text-zinc-600 dark:text-zinc-400">${s.desc}</span>
          <kbd class="px-2 py-1 bg-zinc-100 dark:bg-zinc-800 rounded text-sm text-zinc-700 dark:text-zinc-300">${s.key}</kbd>
        </div>
      `).join('')}
    </div>
    <p class="mt-4 text-xs text-zinc-500 text-center">按任意键关闭</p>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const closeOnKey = () => {
    overlay.remove();
    document.removeEventListener('keydown', closeOnKey);
  };
  setTimeout(() => document.addEventListener('keydown', closeOnKey), 100);
}

export default useKeyboardShortcuts;
