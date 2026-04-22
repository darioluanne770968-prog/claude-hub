'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCw, GitCompare, User, Bot, ChevronDown } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import ReactMarkdown from 'react-markdown';

interface Message {
  type: string;
  timestamp?: string;
  richContent: Array<{
    type: string;
    text?: string;
  }>;
  role: string;
}

interface Session {
  id: string;
  projectName: string;
  summaries: string[];
  customName?: string;
  messages: Message[];
}

interface Project {
  name: string;
  sessions: Array<{
    id: string;
    projectName: string;
    summaries: string[];
    customName?: string;
  }>;
}

function CompareContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [sessions, setSessions] = useState<(Session | null)[]>([null, null]);
  const [loading, setLoading] = useState([false, false]);
  const [allSessions, setAllSessions] = useState<Project[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState<number | null>(null);

  const sessionIds = [
    searchParams.get('left'),
    searchParams.get('right'),
  ];

  useEffect(() => {
    fetchAllSessions();
  }, []);

  useEffect(() => {
    sessionIds.forEach((id, index) => {
      if (id && (!sessions[index] || sessions[index]?.id !== id)) {
        fetchSession(id, index);
      }
    });
  }, [sessionIds[0], sessionIds[1]]);

  const fetchAllSessions = async () => {
    try {
      const res = await fetch('/api/sessions');
      const data = await res.json();
      setAllSessions(data.projects || data);
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
    }
  };

  const fetchSession = async (id: string, index: number) => {
    setLoading(prev => {
      const newLoading = [...prev];
      newLoading[index] = true;
      return newLoading;
    });

    try {
      const res = await fetch(`/api/sessions/${id}`);
      if (res.ok) {
        const data = await res.json();
        setSessions(prev => {
          const newSessions = [...prev];
          newSessions[index] = data;
          return newSessions;
        });
      }
    } catch (error) {
      console.error('Failed to fetch session:', error);
    } finally {
      setLoading(prev => {
        const newLoading = [...prev];
        newLoading[index] = false;
        return newLoading;
      });
    }
  };

  const selectSession = (id: string, index: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(index === 0 ? 'left' : 'right', id);
    router.push(`/compare?${params.toString()}`);
    setDropdownOpen(null);
  };

  const renderSession = (session: Session | null, index: number) => {
    const isLoading = loading[index];

    return (
      <div className="flex-1 flex flex-col min-w-0 border-r border-zinc-200 dark:border-zinc-800 last:border-r-0">
        {/* Session selector */}
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
          <div className="relative">
            <button
              onClick={() => setDropdownOpen(dropdownOpen === index ? null : index)}
              className="w-full flex items-center justify-between px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-lg text-sm text-left hover:border-amber-500 transition-colors"
            >
              <span className="truncate">
                {session ? (session.customName || session.summaries[0] || session.id.slice(0, 8)) : '选择会话...'}
              </span>
              <ChevronDown size={16} className="text-zinc-400 flex-shrink-0" />
            </button>

            {dropdownOpen === index && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg max-h-64 overflow-y-auto z-10">
                {allSessions.map((project) => (
                  <div key={project.name}>
                    <div className="px-3 py-1.5 text-xs font-medium text-zinc-500 bg-zinc-50 dark:bg-zinc-900 sticky top-0">
                      {project.name}
                    </div>
                    {project.sessions.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => selectSession(s.id, index)}
                        className={`w-full px-3 py-2 text-sm text-left hover:bg-zinc-100 dark:hover:bg-zinc-700 truncate ${
                          s.id === session?.id ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600' : ''
                        }`}
                      >
                        {s.customName || s.summaries[0] || s.id.slice(0, 8)}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw size={20} className="animate-spin text-zinc-400" />
            </div>
          ) : session ? (
            session.messages.map((msg, i) => {
              const isUser = msg.role === 'user' || msg.type === 'user';
              const text = msg.richContent?.find(c => c.type === 'text')?.text || '';

              return (
                <div
                  key={i}
                  className={`flex gap-2 ${isUser ? 'flex-row-reverse' : ''}`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isUser ? 'bg-amber-500/20 text-amber-500' : 'bg-blue-500/20 text-blue-500'
                  }`}>
                    {isUser ? <User size={12} /> : <Bot size={12} />}
                  </div>
                  <div className={`flex-1 p-3 rounded-lg text-sm ${
                    isUser
                      ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'
                      : 'bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700'
                  }`}>
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown>{`${text.slice(0, 500)}${text.length > 500 ? '...' : ''}`}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-8 text-zinc-500">
              选择一个会话进行对比
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-zinc-950 flex flex-col">
      {/* Header */}
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.back()}
                className="p-2 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500"
              >
                <ArrowLeft size={20} />
              </button>
              <div className="flex items-center gap-2">
                <GitCompare size={24} className="text-amber-500" />
                <h1 className="text-xl font-bold text-zinc-900 dark:text-white">会话对比</h1>
              </div>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Comparison view */}
      <div className="flex-1 flex">
        {renderSession(sessions[0], 0)}
        {renderSession(sessions[1], 1)}
      </div>
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-zinc-100 dark:bg-zinc-950 flex items-center justify-center">
        <RefreshCw size={24} className="animate-spin text-zinc-500" />
      </div>
    }>
      <CompareContent />
    </Suspense>
  );
}
