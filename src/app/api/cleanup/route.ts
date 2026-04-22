/**
 * API Route: 自动清理旧消息
 * 可以通过 API 调用触发清理,或设置为 GitHub Actions / Vercel Cron 定期调用
 */

import { NextResponse } from 'next/server';
import { autoCleanup, getCleanupHistory } from '@/lib/auto-cleanup';

/**
 * POST /api/cleanup
 * 执行清理操作
 */
export async function POST() {
  try {
    await autoCleanup();

    // 返回最近的清理历史
    const history = await getCleanupHistory(1);

    return NextResponse.json({
      success: true,
      message: 'Cleanup completed',
      lastCleanup: history[0] || null,
    });
  } catch (error) {
    console.error('Cleanup API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/cleanup
 * 获取清理历史
 */
export async function GET() {
  try {
    const history = await getCleanupHistory(10);

    return NextResponse.json({
      success: true,
      history,
    });
  } catch (error) {
    console.error('Get cleanup history error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
