import { NextResponse } from 'next/server';
import { syncAllSessionsToCloud, getCloudSyncStatus } from '@/lib/cloud-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes for large syncs

// GET - Get sync status
export async function GET() {
  try {
    const status = await getCloudSyncStatus();
    return NextResponse.json(status);
  } catch (error) {
    console.error('Failed to get sync status:', error);
    return NextResponse.json(
      { error: 'Failed to get sync status' },
      { status: 500 }
    );
  }
}

// POST - Trigger full sync
export async function POST() {
  try {
    console.log('Starting cloud sync...');
    const result = await syncAllSessionsToCloud();
    console.log('Cloud sync completed:', result);

    return NextResponse.json({
      success: result.success,
      message: `Synced ${result.sessionsUploaded} sessions with ${result.messagesUploaded} messages`,
      details: result,
    });
  } catch (error) {
    console.error('Cloud sync failed:', error);
    return NextResponse.json(
      { error: 'Sync failed', details: String(error) },
      { status: 500 }
    );
  }
}
