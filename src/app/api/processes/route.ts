import { processManager } from '@/lib/processManager';

export const dynamic = 'force-dynamic';

// GET: List all active processes
export async function GET() {
  const processes = processManager.getActiveProcesses();
  return Response.json({
    count: processes.length,
    processes,
  });
}

// DELETE: Kill a process by session ID
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');

  if (!sessionId) {
    return Response.json({ error: 'sessionId is required' }, { status: 400 });
  }

  const killed = processManager.kill(sessionId);

  if (killed) {
    return Response.json({ success: true, message: `Process for session ${sessionId} killed` });
  } else {
    return Response.json({ success: false, message: 'No active process found for this session' }, { status: 404 });
  }
}
