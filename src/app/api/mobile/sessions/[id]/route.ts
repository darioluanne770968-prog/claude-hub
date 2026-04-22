import { NextRequest, NextResponse } from 'next/server';
import {
  getSessionById,
  extractRichContentFromUserMessage,
  extractRichContentFromAssistantMessage,
  isToolResultMessage,
  ExtractedContent,
} from '@/lib/claude-sessions';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const session = await getSessionById(id);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Use the same logic as web API - extract rich content
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
      .filter(msg => msg.richContent.length > 0);

    return NextResponse.json({
      id: session.id,
      provider: session.provider || 'claude',
      projectPath: session.projectPath,
      projectName: session.projectName,
      summaries: session.summaries,
      customName: session.customName,
      lastModified: session.lastModified.toISOString(),
      messages,
    });
  } catch (error) {
    console.error('Error fetching session for mobile:', error);
    return NextResponse.json({ error: 'Failed to fetch session' }, { status: 500 });
  }
}
