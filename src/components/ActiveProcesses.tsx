'use client';

import { useState, useEffect } from 'react';
import { Activity, X, Loader2 } from 'lucide-react';

interface ProcessInfo {
  sessionId: string;
  pid: number;
  startTime: string;
  duration: number;
}

export default function ActiveProcesses() {
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [killing, setKilling] = useState<string | null>(null);

  useEffect(() => {
    const fetchProcesses = async () => {
      try {
        const res = await fetch('/api/processes');
        if (res.ok) {
          const data = await res.json();
          setProcesses(data.processes);
        }
      } catch (error) {
        console.error('Failed to fetch processes:', error);
      }
    };

    fetchProcesses();
    const interval = setInterval(fetchProcesses, 3000); // Poll every 3 seconds

    return () => clearInterval(interval);
  }, []);

  const handleKill = async (sessionId: string) => {
    setKilling(sessionId);
    try {
      const res = await fetch(`/api/processes?sessionId=${sessionId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setProcesses(prev => prev.filter(p => p.sessionId !== sessionId));
      }
    } catch (error) {
      console.error('Failed to kill process:', error);
    } finally {
      setKilling(null);
    }
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}秒`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}分${secs}秒`;
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {/* Badge */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-4 py-2 rounded-full shadow-lg transition-all ${
          processes.length > 0
            ? 'bg-amber-500 hover:bg-amber-600 text-black'
            : 'bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-600 dark:text-zinc-300'
        }`}
      >
        <Activity size={18} className={processes.length > 0 ? 'animate-pulse' : ''} />
        <span className="font-medium">
          {processes.length > 0 ? `${processes.length} 个进程运行中` : '无活跃进程'}
        </span>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute bottom-12 right-0 w-80 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl overflow-hidden">
          <div className="p-3 border-b border-zinc-200 dark:border-zinc-700 flex justify-between items-center">
            <span className="font-medium text-zinc-900 dark:text-white">活跃进程</span>
            <button
              onClick={() => setIsOpen(false)}
              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-white"
            >
              <X size={16} />
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {processes.length === 0 ? (
              <div className="p-4 text-center text-zinc-500 text-sm">
                当前没有运行中的进程
              </div>
            ) : (
              processes.map((process) => (
                <div
                  key={process.sessionId}
                  className="p-3 border-b border-zinc-100 dark:border-zinc-800 last:border-0 flex justify-between items-center hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-zinc-900 dark:text-white truncate">
                      Session: {process.sessionId.slice(0, 8)}...
                    </div>
                    <div className="text-xs text-zinc-500">
                      运行时间: {formatDuration(process.duration)}
                    </div>
                  </div>
                  <button
                    onClick={() => handleKill(process.sessionId)}
                    disabled={killing === process.sessionId}
                    className="ml-2 px-2 py-1 text-xs bg-red-500/20 text-red-500 dark:text-red-400 hover:bg-red-500/30 rounded transition-colors disabled:opacity-50"
                  >
                    {killing === process.sessionId ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      '停止'
                    )}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
