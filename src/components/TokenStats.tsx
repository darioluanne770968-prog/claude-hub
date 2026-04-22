'use client';

import { useState, useEffect } from 'react';
import { Coins, ArrowDown, ArrowUp, Calculator, RefreshCw } from 'lucide-react';

interface TokenStatsData {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
  messageCount: number;
  userMessages: number;
  assistantMessages: number;
  formattedInputTokens: string;
  formattedOutputTokens: string;
  formattedTotalTokens: string;
  formattedCost: string;
  pricing: {
    input: number;
    output: number;
  };
}

interface TokenStatsProps {
  sessionId: string;
}

export default function TokenStats({ sessionId }: TokenStatsProps) {
  const [stats, setStats] = useState<TokenStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
  }, [sessionId]);

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/tokens`);
      if (!res.ok) throw new Error('Failed to fetch stats');
      const data = await res.json();
      setStats(data);
    } catch (err) {
      setError('无法计算Token统计');
      console.error('Failed to fetch token stats:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-zinc-500 text-sm">
        <RefreshCw size={14} className="animate-spin" />
        <span>计算中...</span>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="text-zinc-500 text-sm">{error || '暂无数据'}</div>
    );
  }

  return (
    <div className="bg-zinc-100 dark:bg-zinc-800 rounded-lg p-4 space-y-4">
      <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
        <Calculator size={18} />
        <span className="font-medium">Token 估算</span>
        <span className="text-xs text-zinc-500">(基于Claude 3.5 Sonnet定价)</span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Input tokens */}
        <div className="bg-white dark:bg-zinc-900 rounded-lg p-3">
          <div className="flex items-center gap-2 text-sm text-zinc-500 mb-1">
            <ArrowUp size={14} className="text-blue-500" />
            <span>输入 (用户)</span>
          </div>
          <div className="text-lg font-semibold text-zinc-900 dark:text-white">
            {stats.formattedInputTokens}
          </div>
          <div className="text-xs text-zinc-500">
            {stats.userMessages} 条消息 · ${stats.pricing.input}/1M tokens
          </div>
        </div>

        {/* Output tokens */}
        <div className="bg-white dark:bg-zinc-900 rounded-lg p-3">
          <div className="flex items-center gap-2 text-sm text-zinc-500 mb-1">
            <ArrowDown size={14} className="text-green-500" />
            <span>输出 (Claude)</span>
          </div>
          <div className="text-lg font-semibold text-zinc-900 dark:text-white">
            {stats.formattedOutputTokens}
          </div>
          <div className="text-xs text-zinc-500">
            {stats.assistantMessages} 条消息 · ${stats.pricing.output}/1M tokens
          </div>
        </div>
      </div>

      {/* Total and cost */}
      <div className="flex items-center justify-between pt-3 border-t border-zinc-200 dark:border-zinc-700">
        <div>
          <div className="text-sm text-zinc-500">总计 Token</div>
          <div className="text-xl font-bold text-zinc-900 dark:text-white">
            {stats.formattedTotalTokens}
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-zinc-500">估算成本</div>
          <div className="text-xl font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
            <Coins size={18} />
            {stats.formattedCost}
          </div>
        </div>
      </div>

      <div className="text-xs text-zinc-400 dark:text-zinc-600 text-center">
        * Token 估算基于文本长度，实际用量可能有所不同
      </div>
    </div>
  );
}
