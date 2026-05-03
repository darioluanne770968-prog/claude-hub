'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  GitBranch,
  RefreshCw,
  Upload,
  Download,
  AlertCircle,
  CheckCircle2,
  GitCommit,
  ExternalLink,
} from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';

interface GitProjectStatus {
  name: string;
  path: string;
  isGitRepo: boolean;
  branch?: string;
  uncommittedCount?: number;
  unpushedCount?: number;
  unpulledCount?: number;
  hasRemote?: boolean;
  remoteUrl?: string;
  hasUpstream?: boolean;
  lastCommit?: { hash: string; age: string; message: string };
  error?: string;
}

interface ScanResult {
  rootDir: string;
  projects: GitProjectStatus[];
}

export default function GitDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [actioningPath, setActioningPath] = useState<string | null>(null);
  const [actionLog, setActionLog] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState<Record<string, string>>({});

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/git-dashboard');
      const json = await res.json();
      setData(json);
    } catch (error) {
      console.error('fetch git-dashboard failed', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const runAction = async (
    repoPath: string,
    body: { message?: string | null; action?: 'pull' },
  ) => {
    setActioningPath(repoPath);
    setActionLog(null);
    try {
      const res = await fetch('/api/git-dashboard/commit-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repoPath, ...body }),
      });
      const data = await res.json();
      const log = [data.output, data.error].filter(Boolean).join('\n\n---\n\n');
      setActionLog(`${repoPath.split('/').pop()}:\n\n${log || (res.ok ? '✓ done' : 'failed')}`);
      await fetchData();
    } catch (err) {
      setActionLog(`Error: ${err}`);
    } finally {
      setActioningPath(null);
    }
  };

  const repos = data?.projects.filter(p => p.isGitRepo) || [];
  const nonRepos = data?.projects.filter(p => !p.isGitRepo) || [];
  const totalUncommitted = repos.reduce((s, p) => s + (p.uncommittedCount || 0), 0);
  const totalUnpushed = repos.reduce((s, p) => s + (p.unpushedCount || 0), 0);
  const cleanRepos = repos.filter(
    p => (p.uncommittedCount || 0) === 0 && (p.unpushedCount || 0) === 0,
  ).length;

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/')}
                className="p-2 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <h1 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                  <GitBranch size={24} />
                  Git Dashboard
                </h1>
                <p className="text-sm text-zinc-500">{data?.rootDir || '...'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={fetchData}
                disabled={loading}
                className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors disabled:opacity-50"
              >
                <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
              </button>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {loading && !data ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw size={24} className="animate-spin text-zinc-500" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <SummaryCard label="Git 项目" value={repos.length} color="zinc" icon={<GitBranch size={18} />} />
              <SummaryCard label="干净" value={cleanRepos} color="green" icon={<CheckCircle2 size={18} />} />
              <SummaryCard label="未提交" value={totalUncommitted} color="amber" icon={<GitCommit size={18} />} />
              <SummaryCard label="未推送 commits" value={totalUnpushed} color="red" icon={<Upload size={18} />} />
            </div>

            {actionLog && (
              <pre className="bg-zinc-900 dark:bg-zinc-950 text-zinc-200 text-xs p-3 rounded-lg overflow-x-auto whitespace-pre-wrap max-h-60 border border-zinc-700">
                {actionLog}
              </pre>
            )}

            <div className="space-y-3">
              {repos.map(p => (
                <ProjectCard
                  key={p.path}
                  project={p}
                  busy={actioningPath === p.path}
                  message={messageDraft[p.path] || ''}
                  onMessageChange={(v) => setMessageDraft({ ...messageDraft, [p.path]: v })}
                  onCommitPush={() => runAction(p.path, { message: messageDraft[p.path] || `chore: sync ${p.name}` })}
                  onPushOnly={() => runAction(p.path, { message: null })}
                  onPull={() => runAction(p.path, { action: 'pull' })}
                />
              ))}
            </div>

            {nonRepos.length > 0 && (
              <details className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
                <summary className="text-sm text-zinc-500 cursor-pointer">
                  非 git 项目 ({nonRepos.length})
                </summary>
                <ul className="mt-3 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {nonRepos.map(p => (
                    <li key={p.path}>{p.name}{p.error ? ` — ${p.error}` : ''}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function SummaryCard({
  label, value, color, icon,
}: {
  label: string; value: number; color: 'zinc' | 'green' | 'amber' | 'red'; icon: React.ReactNode;
}) {
  const colorMap = {
    zinc: 'bg-zinc-200 dark:bg-zinc-700/50 text-zinc-600 dark:text-zinc-300',
    green: 'bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400',
    amber: 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400',
    red: 'bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400',
  };
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
      <div className="flex items-center gap-2 mb-1">
        <div className={`p-1.5 rounded-lg ${colorMap[color]}`}>{icon}</div>
        <span className="text-xs text-zinc-500">{label}</span>
      </div>
      <p className="text-2xl font-bold text-zinc-900 dark:text-white">{value}</p>
    </div>
  );
}

function ProjectCard({
  project, busy, message, onMessageChange, onCommitPush, onPushOnly, onPull,
}: {
  project: GitProjectStatus;
  busy: boolean;
  message: string;
  onMessageChange: (v: string) => void;
  onCommitPush: () => void;
  onPushOnly: () => void;
  onPull: () => void;
}) {
  const uncommitted = project.uncommittedCount || 0;
  const unpushed = project.unpushedCount || 0;
  const unpulled = project.unpulledCount || 0;
  const isClean = uncommitted === 0 && unpushed === 0;
  const borderClass = isClean
    ? 'border-zinc-200 dark:border-zinc-800'
    : unpushed > 0
      ? 'border-red-200 dark:border-red-500/30'
      : 'border-amber-200 dark:border-amber-500/30';

  return (
    <div className={`bg-white dark:bg-zinc-900 rounded-xl border ${borderClass} p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="font-semibold text-zinc-900 dark:text-white truncate">{project.name}</h3>
            {project.branch && (
              <span className="text-xs px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 flex items-center gap-1">
                <GitBranch size={11} />
                {project.branch}
              </span>
            )}
            {!project.hasRemote && (
              <span className="text-xs px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">no remote</span>
            )}
            {project.hasRemote && !project.hasUpstream && (
              <span className="text-xs px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400">no upstream</span>
            )}
          </div>
          {project.lastCommit && (
            <p className="text-xs text-zinc-500 truncate">
              {project.lastCommit.hash} · {project.lastCommit.age} · {project.lastCommit.message}
            </p>
          )}
          {project.remoteUrl && (
            <a
              href={project.remoteUrl.replace(/^git@github\.com:/, 'https://github.com/').replace(/\.git$/, '')}
              target="_blank"
              rel="noopener"
              className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 truncate flex items-center gap-1 mt-1"
            >
              <ExternalLink size={10} />
              {project.remoteUrl.replace(/^git@github\.com:/, '').replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '')}
            </a>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {uncommitted > 0 && (
            <span className="text-xs px-2 py-1 rounded bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 font-medium">
              {uncommitted} 未提交
            </span>
          )}
          {unpushed > 0 && (
            <span className="text-xs px-2 py-1 rounded bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400 font-medium">
              ↑ {unpushed} 未推送
            </span>
          )}
          {unpulled > 0 && (
            <span className="text-xs px-2 py-1 rounded bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 font-medium">
              ↓ {unpulled} 未拉
            </span>
          )}
          {isClean && (
            <span className="text-xs px-2 py-1 rounded bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400 font-medium flex items-center gap-1">
              <CheckCircle2 size={12} />
              干净
            </span>
          )}
        </div>
      </div>

      {(uncommitted > 0 || unpushed > 0 || unpulled > 0) && project.hasUpstream && (
        <div className="flex flex-wrap items-center gap-2">
          {uncommitted > 0 && (
            <input
              type="text"
              value={message}
              onChange={(e) => onMessageChange(e.target.value)}
              placeholder={`chore: sync ${project.name}`}
              disabled={busy}
              className="flex-1 min-w-0 px-3 py-1.5 text-sm bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
            />
          )}
          {uncommitted > 0 && (
            <button
              onClick={onCommitPush}
              disabled={busy}
              className="px-3 py-1.5 text-sm rounded bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap"
            >
              <Upload size={14} />
              {busy ? '...' : 'commit & push'}
            </button>
          )}
          {uncommitted === 0 && unpushed > 0 && (
            <button
              onClick={onPushOnly}
              disabled={busy}
              className="px-3 py-1.5 text-sm rounded bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-400 hover:bg-red-500/20 disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap"
            >
              <Upload size={14} />
              {busy ? '...' : 'push'}
            </button>
          )}
          {unpulled > 0 && (
            <button
              onClick={onPull}
              disabled={busy}
              className="px-3 py-1.5 text-sm rounded bg-blue-500/10 border border-blue-500/30 text-blue-700 dark:text-blue-400 hover:bg-blue-500/20 disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap"
            >
              <Download size={14} />
              {busy ? '...' : 'pull'}
            </button>
          )}
        </div>
      )}

      {project.error && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
          <AlertCircle size={12} />
          {project.error}
        </p>
      )}
    </div>
  );
}
