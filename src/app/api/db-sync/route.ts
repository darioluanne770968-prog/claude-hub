import { NextResponse } from 'next/server';
import { syncAllSessions, getSyncStatus } from '@/lib/db-sync';

// GET - Get sync status
export async function GET() {
  try {
    const status = getSyncStatus();
    return NextResponse.json(status);
  } catch (error) {
    console.error('Failed to get sync status:', error);
    return NextResponse.json({ error: 'Failed to get sync status' }, { status: 500 });
  }
}

// POST - Trigger sync
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const force = body.force === true;

    const result = await syncAllSessions({ force });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Failed to sync database:', error);
    return NextResponse.json({ error: 'Failed to sync database' }, { status: 500 });
  }
}
