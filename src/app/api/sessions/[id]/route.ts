import { NextResponse } from 'next/server';
import {
  getSessionById,
  extractRichContentFromUserMessage,
  extractRichContentFromAssistantMessage,
  isToolResultMessage,
  ExtractedContent,
  deleteSessionById
} from '@/lib/claude-sessions';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSessionById(id);

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
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

    return NextResponse.json({
      id: session.id,
      projectPath: session.projectPath,
      projectName: session.projectName,
      summaries: session.summaries,
      customName: session.customName,
      lastModified: session.lastModified.toISOString(),
      messages,
    });
  } catch (error) {
    console.error('Error fetching session:', error);
    return NextResponse.json({ error: 'Failed to fetch session' }, { status: 500 });
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
