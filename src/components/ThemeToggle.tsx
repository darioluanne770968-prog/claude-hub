'use client';

import { Sun, Moon, Laptop } from 'lucide-react';
import { useTheme } from './ThemeProvider';

export default function ThemeToggle() {
  const { theme, toggleTheme, mounted } = useTheme();

  const handleClick = () => {
    toggleTheme();
  };

  // Prevent hydration mismatch by showing a placeholder before mount
  if (!mounted) {
    return (
      <div className="p-2 w-9 h-9 rounded-lg bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
    );
  }

  const getIcon = () => {
    switch (theme) {
      case 'light': return <Sun size={20} />;
      case 'dark': return <Moon size={20} />;
      case 'system': return <Laptop size={20} />;
    }
  };

  const getTitle = () => {
    switch (theme) {
      case 'light': return '切换到暗色模式';
      case 'dark': return '切换到跟随系统';
      case 'system': return '切换到亮色模式';
    }
  };

  return (
    <button
      onClick={handleClick}
      className="p-2 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
      title={getTitle()}
    >
      {getIcon()}
    </button>
  );
}
