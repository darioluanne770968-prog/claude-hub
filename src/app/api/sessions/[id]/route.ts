import { NextRequest, NextResponse } from 'next/server';
import {
  getSessionById,
  extractRichContentFromUserMessage,
  extractRichContentFromAssistantMessage,
  isToolResultMessage,
  ExtractedContent,
  deleteSessionById,
  parseSessionContent
} from '@/lib/claude-sessions';
import { getHostById } from '@/lib/remote-hosts';
import { fetchRemoteSessionContent } from '@/lib/ssh-client';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const dynamic = 'force-dynamic';

// Helper function to get customName from user data store
function getCustomNameFromUserData(sessionId: string): string | undefined {
  try {
    const userDataFile = path.join(os.homedir(), '.claude', 'claude-hub-user-data.json');
    if (fs.existsSync(userDataFile)) {
      const content = fs.readFileSync(userDataFile, 'utf8');
      const data = JSON.parse(content);
      return data.customNames?.[sessionId] || undefined;
    }
  } catch (error) {
    console.error('Failed to read user data for customName:', error);
  }
  return undefined;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  console.log('[Session API] Request received:', request.url);
  try {
    const { id } = await context.params;
    console.log('[Session API] Session ID:', id);
    const { searchParams } = new URL(request.url);
    const hostId = searchParams.get('hostId');
    const projectPath = searchParams.get('projectPath');

    let session;

    // Check if this is a remote session
    if (hostId && projectPath) {
      const host = getHostById(hostId);
      if (!host) {
        return NextResponse.json({ error: 'Remote host not found' }, { status: 404 });
      }

      // Fetch session content from remote host
      const content = await fetchRemoteSessionContent(host, id, projectPath);
      if (!content) {
        return NextResponse.json({ error: 'Session not found on remote host' }, { status: 404 });
      }

      // Parse the remote session content
      session = parseSessionContent(id, content, projectPath);
      if (!session) {
        return NextResponse.json({ error: 'Failed to parse remote session' }, { status: 500 });
      }
    } else {
      // Local session
      session = await getSessionById(id);
      if (!session) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      }
    }

    // Transform messages for display - show everything
    const messages = session.messages
      .filter(entry => entry.type === 'user' || entry.type === 'assistant')
      .map(entry => {
        // Tool results should be displayed as part of assistant workflow
        const isToolResult = entry.type === 'user' && isToolResultMessage(entry.message);

        const richContent: ExtractedContent[] = entry.type === 'assistant'
          ? extractRichContentFromAssistantMessage(entry.message)
          : extractRichContentFromUserMessage(entry.message);

        return {
          // Tool results display on assistant side
          type: isToolResult ? 'tool-result' : entry.type,
          uuid: entry.uuid,
          timestamp: entry.timestamp,
          richContent,
          role: isToolResult ? 'assistant' : entry.message?.role,
        };
      })
      .filter(msg => msg.richContent.length > 0); // Filter out empty messages

    // JSONL is the source of truth (terminal /rename and Hub renames both write there).
    // user-data.json is only a fallback for legacy entries.
    const finalCustomName = session.customName || getCustomNameFromUserData(session.id);

    return NextResponse.json({
      id: session.id,
      provider: session.provider || 'claude',
      projectPath: session.projectPath,
      projectName: session.projectName,
      summaries: session.summaries,
      summariesWithTimestamps: session.summariesWithTimestamps,
      customName: finalCustomName,
      lastModified: session.lastModified.toISOString(),
      messages,
      isRemote: !!hostId,
    });
  } catch (error) {
    console.error('[Session API] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : '';
    console.error('[Session API] Stack:', errorStack);
    return NextResponse.json({
      error: 'Failed to fetch session',
      details: errorMessage,
      stack: process.env.NODE_ENV === 'development' ? errorStack : undefined
    }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const success = await deleteSessionById(id);

    if (!success) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Session deleted' });
  } catch (error) {
    console.error('Error deleting session:', error);
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
  }
}
