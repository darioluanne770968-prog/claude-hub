'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  MessageSquare,
  FolderOpen,
  Calendar,
  TrendingUp,
  Wrench,
  BarChart3,
  RefreshCw,
} from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';

interface DailyStats {
  date: string;
  sessionCount: number;
  messageCount: number;
}

interface ProjectStats {
  name: string;
  sessionCount: number;
  messageCount: number;
  lastActive: string;
}

interface ToolStats {
  name: string;
  count: number;
}

interface Stats {
  totalSessions: number;
  totalMessages: number;
  totalProjects: number;
  toolUsage: ToolStats[];
  dailyActivity: DailyStats[];
  topProjects: ProjectStats[];
  averageMessagesPerSession: number;
  oldestSession: string;
  newestSession: string;
}

// Tool name to Chinese label
const toolLabels: Record<string, string> = {
  Read: '读取文件',
  Write: '写入文件',
  Edit: '编辑文件',
  Bash: '执行命令',
  Grep: '搜索内容',
  Glob: '查找文件',
  Task: '子任务',
  WebSearch: '网络搜索',
  WebFetch: '获取网页',
  AskUserQuestion: '询问用户',
  TodoWrite: '任务列表',
};

export default function StatsPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  // Calculate max values for chart scaling
  const maxMessages = stats?.dailyActivity
    ? Math.max(...stats.dailyActivity.map(d => d.messageCount), 1)
    : 1;
  const maxToolCount = stats?.toolUsage?.[0]?.count || 1;

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-zinc-950">
      {/* Header */}
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
                  <BarChart3 size={24} />
                  统计仪表盘
                </h1>
                <p className="text-sm text-zinc-500">会话数据分析</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={fetchStats}
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
        {loading && !stats ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw size={24} className="animate-spin text-zinc-500" />
          </div>
        ) : stats ? (
          <div className="space-y-6">
            {/* Overview Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-amber-100 dark:bg-amber-500/20 rounded-lg">
                    <MessageSquare size={20} className="text-amber-600 dark:text-amber-400" />
                  </div>
                  <span className="text-sm text-zinc-500">总会话数</span>
                </div>
                <p className="text-3xl font-bold text-zinc-900 dark:text-white">
                  {stats.totalSessions.toLocaleString()}
                </p>
              </div>

              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-blue-100 dark:bg-blue-500/20 rounded-lg">
                    <TrendingUp size={20} className="text-blue-600 dark:text-blue-400" />
                  </div>
                  <span className="text-sm text-zinc-500">总消息数</span>
                </div>
                <p className="text-3xl font-bold text-zinc-900 dark:text-white">
                  {stats.totalMessages.toLocaleString()}
                </p>
              </div>

              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-green-100 dark:bg-green-500/20 rounded-lg">
                    <FolderOpen size={20} className="text-green-600 dark:text-green-400" />
                  </div>
                  <span className="text-sm text-zinc-500">项目数</span>
                </div>
                <p className="text-3xl font-bold text-zinc-900 dark:text-white">
                  {stats.totalProjects}
                </p>
              </div>

              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-purple-100 dark:bg-purple-500/20 rounded-lg">
                    <Calendar size={20} className="text-purple-600 dark:text-purple-400" />
                  </div>
                  <span className="text-sm text-zinc-500">平均消息/会话</span>
                </div>
                <p className="text-3xl font-bold text-zinc-900 dark:text-white">
                  {stats.averageMessagesPerSession}
                </p>
              </div>
            </div>

            {/* Activity Chart */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
                <TrendingUp size={20} />
                近 30 天活动
              </h2>
              <div className="h-48 flex items-end gap-1">
                {stats.dailyActivity.map((day, i) => (
                  <div
                    key={day.date}
                    className="flex-1 flex flex-col items-center gap-1 group"
                  >
                    <div className="relative w-full">
                      <div
                        className="w-full bg-amber-500 dark:bg-amber-400 rounded-t transition-all hover:bg-amber-600 dark:hover:bg-amber-300"
                        style={{
                          height: `${(day.messageCount / maxMessages) * 160}px`,
                          minHeight: day.messageCount > 0 ? '4px' : '0',
                        }}
                      />
                      {/* Tooltip */}
                      <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block z-10">
                        <div className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs rounded px-2 py-1 whitespace-nowrap">
                          <p className="font-medium">{day.date}</p>
                          <p>{day.messageCount} 消息</p>
                          <p>{day.sessionCount} 会话</p>
                        </div>
                      </div>
                    </div>
                    {i % 7 === 0 && (
                      <span className="text-[10px] text-zinc-400 truncate w-full text-center">
                        {day.date.slice(5)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Tool Usage */}
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
                  <Wrench size={20} />
                  工具使用统计
                </h2>
                <div className="space-y-3">
                  {stats.toolUsage.map((tool) => (
                    <div key={tool.name} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-zinc-700 dark:text-zinc-300">
                          {toolLabels[tool.name] || tool.name}
                        </span>
                        <span className="text-zinc-500">{tool.count.toLocaleString()}</span>
                      </div>
                      <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full"
                          style={{ width: `${(tool.count / maxToolCount) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  {stats.toolUsage.length === 0 && (
                    <p className="text-zinc-500 text-sm">暂无工具使用数据</p>
                  )}
                </div>
              </div>

              {/* Top Projects */}
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
                  <FolderOpen size={20} />
                  活跃项目 Top 10
                </h2>
                <div className="space-y-3">
                  {stats.topProjects.map((project, i) => (
                    <div
                      key={project.name}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                    >
                      <span className="w-6 h-6 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 rounded text-xs font-medium text-zinc-500">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-900 dark:text-white truncate">
                          {project.name}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {project.sessionCount} 会话 · {project.messageCount} 消息
                        </p>
                      </div>
                      <span className="text-xs text-zinc-400">
                        {project.lastActive}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Date Range */}
            <div className="text-center text-sm text-zinc-500">
              数据范围: {stats.oldestSession} 至 {stats.newestSession}
            </div>
          </div>
        ) : (
          <div className="text-center py-20 text-zinc-500">
            加载统计数据失败
          </div>
        )}
      </main>
    </div>
  );
}
