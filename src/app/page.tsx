'use client';

import { useEffect, useState } from 'react';
import { Search, RefreshCw, MessageSquareText } from 'lucide-react';
import ProjectGroup from '@/components/ProjectGroup';

interface Session {
  id: string;
  projectPath: string;
  projectName: string;
  summaries: string[];
  customName?: string;
  lastModified: string;
  firstMessage?: string;
  messageCount: number;
}

interface Project {
  name: string;
  path: string;
  sessions: Session[];
}

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sessions');
      const data = await res.json();
      setProjects(data);
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filter projects and sessions by search
  const filteredProjects = projects
    .map(project => ({
      ...project,
      sessions: project.sessions.filter(session => {
        const searchLower = search.toLowerCase();
        return (
          session.customName?.toLowerCase().includes(searchLower) ||
          session.summaries.some(s => s.toLowerCase().includes(searchLower)) ||
          session.firstMessage?.toLowerCase().includes(searchLower) ||
          session.projectName.toLowerCase().includes(searchLower)
        );
      }),
    }))
    .filter(project => project.sessions.length > 0);

  const totalSessions = projects.reduce((acc, p) => acc + p.sessions.length, 0);

  // Handle session deletion
  const handleDeleteSession = (sessionId: string) => {
    setProjects(prevProjects =>
      prevProjects.map(project => ({
        ...project,
        sessions: project.sessions.filter(s => s.id !== sessionId),
      })).filter(project => project.sessions.length > 0)
    );
  };

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <MessageSquareText size={28} className="text-amber-500" />
              <h1 className="text-xl font-bold text-white">Claude Hub</h1>
              <span className="text-sm text-zinc-500">Session Manager</span>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <Search
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                />
                <input
                  type="text"
                  placeholder="Search sessions..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-500/50 w-64"
                />
              </div>

              <button
                onClick={fetchData}
                disabled={loading}
                className="p-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors disabled:opacity-50"
              >
                <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Stats */}
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="flex items-center gap-6 text-sm text-zinc-400">
          <span>{projects.length} projects</span>
          <span>{totalSessions} sessions</span>
        </div>
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
            />
          ))
        )}
      </main>
    </div>
  );
}
