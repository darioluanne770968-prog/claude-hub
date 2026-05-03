'use client';

import { useEffect, useState, useCallback } from 'react';
import { Search, RefreshCw, MessageSquareText, Server, Laptop, BarChart3, Calendar, Tag, X, GitCompare, FileText, Download, Bell, Database, GitBranch } from 'lucide-react';
import Link from 'next/link';
import ProjectGroup from '@/components/ProjectGroup';
import ThemeToggle from '@/components/ThemeToggle';
import CloudSyncButton from '@/components/CloudSyncButton';
import EncryptedSyncButton from '@/components/EncryptedSyncButton';
import RemoteHostsManager from '@/components/RemoteHostsManager';
import GlobalSearch from '@/components/GlobalSearch';
import TemplateManager from '@/components/TemplateManager';
import WebhooksManager from '@/components/WebhooksManager';
import Tooltip from '@/components/Tooltip';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

interface SessionSource {
  type: 'local' | 'remote';
  hostId?: string;
  hostName?: string;
}

interface SummaryWithTimestamp {
  text: string;
  timestamp: string;
}

interface Session {
  id: string;
  provider?: 'claude' | 'codex';
  projectPath: string;
  projectName: string;
  originalProjectPath?: string;
  summaries: string[];
  summariesWithTimestamps?: SummaryWithTimestamp[];
  customName?: string;
  lastModified: string;
  firstMessage?: string;
  messageCount: number;
  source?: SessionSource;
  tags?: string[];
  isIde?: boolean;
}

interface Project {
  name: string;
  path: string;
  sessions: Session[];
}

// Module-level cache: survives route navigation (page unmount → remount) but
// is cleared on full reload. Lets us restore data + scroll position when
// returning from /session/[id], so the user lands exactly where they left off.
let cachedProjects: Project[] | null = null;
let cachedRemoteProjects: Project[] = [];
let cachedRemoteErrors: Array<{ hostName: string; error: string }> = [];
let cachedAllTags: string[] = [];
let cachedSearch = '';
let cachedSelectedTags: string[] = [];
let cachedScrollY = 0;

export default function Home() {
  const [projects, setProjects] = useState<Project[]>(() => cachedProjects ?? []);
  const [loading, setLoading] = useState(cachedProjects === null);
  const [search, setSearch] = useState(cachedSearch);
  const [showRemoteHostsManager, setShowRemoteHostsManager] = useState(false);
  const [remoteProjects, setRemoteProjects] = useState<Project[]>(() => cachedRemoteProjects);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteErrors, setRemoteErrors] = useState<Array<{ hostName: string; error: string }>>(() => cachedRemoteErrors);
  const [allTags, setAllTags] = useState<string[]>(() => cachedAllTags);
  const [selectedTags, setSelectedTags] = useState<string[]>(() => cachedSelectedTags);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [showWebhooksManager, setShowWebhooksManager] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const fetchLocalData = async () => {
    // Only show the full-page spinner on the very first load; subsequent
    // refreshes happen silently so scroll position stays put.
    if (cachedProjects === null) setLoading(true);
    try {
      const res = await fetch('/api/sessions');
      const data = await res.json();
      // Handle new API response format
      const projectsData = data.projects || data;
      // Add local source to all sessions
      const localProjects = projectsData.map((project: Project) => ({
        ...project,
        sessions: project.sessions.map((session: Session) => ({
          ...session,
          source: { type: 'local' as const },
        })),
      }));
      cachedProjects = localProjects;
      setProjects(localProjects);
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRemoteData = async (forceRefresh = false) => {
    setRemoteLoading(true);
    setRemoteErrors([]);
    try {
      const url = forceRefresh ? '/api/remote-sessions?refresh=true' : '/api/remote-sessions';
      const res = await fetch(url);
      const data = await res.json();
      if (data.projects) {
        cachedRemoteProjects = data.projects;
        setRemoteProjects(data.projects);
      }
      if (data.errors && data.errors.length > 0) {
        cachedRemoteErrors = data.errors;
        setRemoteErrors(data.errors);
      } else {
        cachedRemoteErrors = [];
      }
    } catch (error) {
      console.error('Failed to fetch remote sessions:', error);
    } finally {
      setRemoteLoading(false);
    }
  };

  const fetchTags = async () => {
    try {
      const res = await fetch('/api/tags');
      const data = await res.json();
      cachedAllTags = data.allTags || [];
      setAllTags(cachedAllTags);
    } catch (error) {
      console.error('Failed to fetch tags:', error);
    }
  };

  const fetchData = async (forceRefreshRemote = false) => {
    await Promise.all([fetchLocalData(), fetchRemoteData(forceRefreshRemote), fetchTags()]);
  };

  const syncDatabase = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/db-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      });
      const data = await res.json();
      if (data.success) {
        console.log(`Database synced: ${data.synced} sessions in ${data.duration}ms`);
      }
    } catch (error) {
      console.error('Failed to sync database:', error);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    // First mount of the session: do a full fetch. Subsequent mounts (e.g. user
    // came back from /session/[id]) skip the fetch — cached data is reused.
    // The refresh button still calls fetchData(true) explicitly.
    if (cachedProjects === null) {
      fetchData();
    }

    // Restore scroll position from before navigating into a session.
    // Run after paint so the list DOM has its full height.
    if (cachedScrollY > 0) {
      const y = cachedScrollY;
      requestAnimationFrame(() => window.scrollTo(0, y));
    }

    const onScroll = () => {
      cachedScrollY = window.scrollY;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Mirror filter state to the cache so it survives navigation too.
  useEffect(() => { cachedSearch = search; }, [search]);
  useEffect(() => { cachedSelectedTags = selectedTags; }, [selectedTags]);

  // Merge local and remote projects
  const allProjects = [...projects, ...remoteProjects];

  // Theme toggle helper
  const toggleTheme = useCallback(() => {
    const html = document.documentElement;
    const isDark = html.classList.contains('dark');
    html.classList.toggle('dark', !isDark);
    localStorage.setItem('theme', isDark ? 'light' : 'dark');
  }, []);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onToggleTheme: toggleTheme,
    onRefresh: () => fetchData(true),
  });

  // Toggle tag selection
  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  // Filter projects and sessions by search and tags
  const filteredProjects = allProjects
    .map(project => ({
      ...project,
      sessions: project.sessions.filter(session => {
        const searchLower = search.toLowerCase();
        const matchesSearch = !search || (
          session.customName?.toLowerCase().includes(searchLower) ||
          session.summaries.some(s => s.toLowerCase().includes(searchLower)) ||
          session.firstMessage?.toLowerCase().includes(searchLower) ||
          session.projectName.toLowerCase().includes(searchLower) ||
          session.source?.hostName?.toLowerCase().includes(searchLower)
        );
        const matchesTags = selectedTags.length === 0 ||
          selectedTags.every(tag => session.tags?.includes(tag));
        return matchesSearch && matchesTags;
      }),
    }))
    .filter(project => project.sessions.length > 0);

  const totalSessions = allProjects.reduce((acc, p) => acc + p.sessions.length, 0);
  const localSessions = projects.reduce((acc, p) => acc + p.sessions.length, 0);
  const remoteSessions = remoteProjects.reduce((acc, p) => acc + p.sessions.length, 0);

  // Handle session deletion
  const handleDeleteSession = (sessionId: string) => {
    setProjects(prevProjects => {
      const next = prevProjects.map(project => ({
        ...project,
        sessions: project.sessions.filter(s => s.id !== sessionId),
      })).filter(project => project.sessions.length > 0);
      cachedProjects = next;
      return next;
    });
  };

  // Handle session rename
  const handleRenameSession = (sessionId: string, newName: string) => {
    setProjects(prevProjects => {
      const next = prevProjects.map(project => ({
        ...project,
        sessions: project.sessions.map(s =>
          s.id === sessionId ? { ...s, customName: newName || undefined } : s
        ),
      }));
      cachedProjects = next;
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-zinc-950">
      {/* Header - draggable for Electron */}
      <header className="electron-drag border-b border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 electron-titlebar-padding">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <MessageSquareText size={28} className="text-amber-500" />
              <h1 className="text-xl font-bold text-zinc-900 dark:text-white">Claude Hub</h1>
              <span className="text-sm text-zinc-500">Session Manager</span>
            </div>

            <div className="flex items-center gap-3 electron-no-drag">
              {/* Local filter search */}
              <div className="relative">
                <Search
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                />
                <input
                  type="text"
                  placeholder="筛选会话..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg pl-10 pr-4 py-2 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-500/50 w-48"
                />
              </div>

              {/* Global search */}
              <GlobalSearch />

              {/* Cloud sync */}
              <Tooltip content="同步到云端，手机可访问">
                <CloudSyncButton />
              </Tooltip>

              {/* Encrypted sync */}
              <Tooltip content="端到端加密同步">
                <EncryptedSyncButton />
              </Tooltip>

              <Tooltip content="切换深色/浅色主题">
                <ThemeToggle />
              </Tooltip>

              <Tooltip content="统计仪表盘">
                <Link
                  href="/stats"
                  className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
                >
                  <BarChart3 size={18} />
                </Link>
              </Tooltip>

              <Tooltip content="会话日历">
                <Link
                  href="/calendar"
                  className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
                >
                  <Calendar size={18} />
                </Link>
              </Tooltip>

              <Tooltip content="会话对比">
                <Link
                  href="/compare"
                  className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
                >
                  <GitCompare size={18} />
                </Link>
              </Tooltip>

              <Tooltip content="Git 面板（推送状态）">
                <Link
                  href="/git-dashboard"
                  className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
                >
                  <GitBranch size={18} />
                </Link>
              </Tooltip>

              <Tooltip content="Prompt 模板管理">
                <button
                  onClick={() => setShowTemplateManager(true)}
                  className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
                >
                  <FileText size={18} />
                </button>
              </Tooltip>

              <Tooltip content="Webhooks 管理">
                <button
                  onClick={() => setShowWebhooksManager(true)}
                  className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
                >
                  <Bell size={18} />
                </button>
              </Tooltip>

              <Tooltip content="同步数据库索引">
                <button
                  onClick={syncDatabase}
                  disabled={syncing}
                  className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors disabled:opacity-50"
                >
                  <Database size={18} className={syncing ? 'animate-pulse' : ''} />
                </button>
              </Tooltip>

              <Tooltip content="备份数据">
                <a
                  href="/api/backup"
                  onClick={async (e) => {
                    e.preventDefault();
                    const res = await fetch('/api/backup', { method: 'POST' });
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `claude-hub-backup-${new Date().toISOString().split('T')[0]}.json`;
                    a.click();
                  }}
                  className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors cursor-pointer"
                >
                  <Download size={18} />
                </a>
              </Tooltip>

              <Tooltip content="管理远程主机">
                <button
                  onClick={() => setShowRemoteHostsManager(true)}
                  className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
                >
                  <Server size={18} />
                </button>
              </Tooltip>

              <Tooltip content="刷新会话列表">
                <button
                  onClick={() => fetchData(true)}
                  disabled={loading || remoteLoading}
                  className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors disabled:opacity-50"
                >
                  <RefreshCw size={18} className={loading || remoteLoading ? 'animate-spin' : ''} />
                </button>
              </Tooltip>
            </div>
          </div>
        </div>
      </header>

      {/* Stats */}
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="flex items-center gap-6 text-sm text-zinc-500 dark:text-zinc-400">
          <span>{allProjects.length} projects</span>
          <span className="flex items-center gap-1">
            <Laptop size={14} />
            {localSessions} local
          </span>
          {remoteSessions > 0 && (
            <span className="flex items-center gap-1">
              <Server size={14} />
              {remoteSessions} remote
            </span>
          )}
          {remoteLoading && (
            <span className="flex items-center gap-1 text-amber-500">
              <RefreshCw size={14} className="animate-spin" />
              Loading remote...
            </span>
          )}
          {remoteErrors.length > 0 && (
            <span className="text-red-500" title={remoteErrors.map(e => `${e.hostName}: ${e.error}`).join('\n')}>
              {remoteErrors.length} host error(s)
            </span>
          )}
        </div>

        {/* Tag filters */}
        {allTags.length > 0 && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <Tag size={14} className="text-zinc-400" />
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`px-2 py-1 rounded-full text-xs transition-colors ${selectedTags.includes(tag)
                  ? 'bg-amber-500 text-black'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                  }`}
              >
                {tag}
              </button>
            ))}
            {selectedTags.length > 0 && (
              <button
                onClick={() => setSelectedTags([])}
                className="flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors"
              >
                <X size={12} />
                清除筛选
              </button>
            )}
          </div>
        )}
      </div>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-4 pb-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw size={24} className="animate-spin text-zinc-500" />
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="text-center py-20 text-zinc-500">
            {search ? 'No sessions found matching your search' : 'No sessions found'}
          </div>
        ) : (
          filteredProjects.map((project, index) => (
            <ProjectGroup
              key={project.path}
              name={project.name}
              path={project.path}
              sessions={project.sessions}
              defaultExpanded={index < 3}
              onDeleteSession={handleDeleteSession}
              onRenameSession={handleRenameSession}
            />
          ))
        )}
      </main>

      {/* Remote Hosts Manager Modal */}
      <RemoteHostsManager
        isOpen={showRemoteHostsManager}
        onClose={() => setShowRemoteHostsManager(false)}
        onHostsChanged={fetchRemoteData}
      />

      {/* Template Manager Modal */}
      <TemplateManager
        isOpen={showTemplateManager}
        onClose={() => setShowTemplateManager(false)}
      />

      {/* Webhooks Manager Modal */}
      <WebhooksManager
        isOpen={showWebhooksManager}
        onClose={() => setShowWebhooksManager(false)}
      />
    </div>
  );
}
