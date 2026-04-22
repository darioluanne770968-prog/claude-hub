'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCw, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import Link from 'next/link';

interface SessionInfo {
  id: string;
  projectName: string;
  summary: string;
  messageCount: number;
}

interface DayData {
  date: string;
  sessions: SessionInfo[];
  messageCount: number;
}

export default function CalendarPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [dayData, setDayData] = useState<Record<string, DayData>>({});
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const fetchCalendarData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/calendar');
      const data = await res.json();
      setDayData(data.days || {});
    } catch (error) {
      console.error('Failed to fetch calendar data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCalendarData();
  }, []);

  // Get days in the current month view
  const getDaysInMonth = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const days: { date: Date; isCurrentMonth: boolean }[] = [];

    // Add days from previous month to fill the first week
    const startPadding = firstDay.getDay();
    for (let i = startPadding - 1; i >= 0; i--) {
      const date = new Date(year, month, -i);
      days.push({ date, isCurrentMonth: false });
    }

    // Add all days in current month
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push({ date: new Date(year, month, i), isCurrentMonth: true });
    }

    // Add days from next month to complete the grid
    const endPadding = 42 - days.length; // 6 rows * 7 days
    for (let i = 1; i <= endPadding; i++) {
      days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
    }

    return days;
  };

  const formatDateKey = (date: Date) => {
    return date.toISOString().split('T')[0];
  };

  const getActivityLevel = (count: number): number => {
    if (count === 0) return 0;
    if (count <= 5) return 1;
    if (count <= 15) return 2;
    if (count <= 30) return 3;
    return 4;
  };

  const activityColors = [
    'bg-zinc-100 dark:bg-zinc-800',
    'bg-green-200 dark:bg-green-900',
    'bg-green-400 dark:bg-green-700',
    'bg-green-500 dark:bg-green-500',
    'bg-green-600 dark:bg-green-400',
  ];

  const days = getDaysInMonth();
  const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
    setSelectedDay(null);
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
    setSelectedDay(null);
  };

  const goToToday = () => {
    setCurrentMonth(new Date());
    setSelectedDay(formatDateKey(new Date()));
  };

  const selectedDayData = selectedDay ? dayData[selectedDay] : null;

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.back()}
                className="p-2 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <h1 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                  <Calendar size={24} />
                  会话日历
                </h1>
                <p className="text-sm text-zinc-500">按日期查看会话活动</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={fetchCalendarData}
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
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Calendar */}
          <div className="lg:col-span-2 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
            {/* Month navigation */}
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={prevMonth}
                className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
              >
                <ChevronLeft size={20} />
              </button>
              <div className="text-center">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
                  {currentMonth.getFullYear()} 年 {monthNames[currentMonth.getMonth()]}
                </h2>
                <button
                  onClick={goToToday}
                  className="text-sm text-amber-600 dark:text-amber-400 hover:underline"
                >
                  今天
                </button>
              </div>
              <button
                onClick={nextMonth}
                className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
              >
                <ChevronRight size={20} />
              </button>
            </div>

            {/* Week days header */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {weekDays.map((day) => (
                <div key={day} className="text-center text-sm font-medium text-zinc-500 py-2">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {days.map(({ date, isCurrentMonth }, i) => {
                const dateKey = formatDateKey(date);
                const data = dayData[dateKey];
                const level = getActivityLevel(data?.messageCount || 0);
                const isToday = dateKey === formatDateKey(new Date());
                const isSelected = dateKey === selectedDay;

                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDay(dateKey)}
                    className={`
                      aspect-square rounded-lg flex flex-col items-center justify-center gap-1 transition-all
                      ${isCurrentMonth ? 'text-zinc-900 dark:text-white' : 'text-zinc-400 dark:text-zinc-600'}
                      ${isToday ? 'ring-2 ring-amber-500' : ''}
                      ${isSelected ? 'ring-2 ring-blue-500' : ''}
                      ${activityColors[level]}
                      hover:ring-2 hover:ring-zinc-400
                    `}
                  >
                    <span className="text-sm font-medium">{date.getDate()}</span>
                    {data && data.sessions.length > 0 && (
                      <span className="text-[10px] text-zinc-600 dark:text-zinc-300">
                        {data.sessions.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center justify-center gap-2 mt-4 text-xs text-zinc-500">
              <span>少</span>
              {activityColors.map((color, i) => (
                <div key={i} className={`w-4 h-4 rounded ${color}`} />
              ))}
              <span>多</span>
            </div>
          </div>

          {/* Selected day details */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">
              {selectedDay ? selectedDay : '选择日期查看详情'}
            </h3>

            {selectedDayData ? (
              <div className="space-y-4">
                <div className="text-sm text-zinc-500">
                  {selectedDayData.sessions.length} 个会话 · {selectedDayData.messageCount} 条消息
                </div>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {selectedDayData.sessions.map((session) => (
                    <Link
                      key={session.id}
                      href={`/session/${session.id}`}
                      className="block p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    >
                      <p className="text-sm font-medium text-zinc-900 dark:text-white line-clamp-1">
                        {session.summary || '无摘要'}
                      </p>
                      <p className="text-xs text-zinc-500 mt-1">
                        {session.projectName} · {session.messageCount} 消息
                      </p>
                    </Link>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-zinc-500 text-sm">
                {selectedDay ? '该日期没有会话记录' : '点击日历上的日期查看当天的会话'}
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
