import { NextResponse } from 'next/server';
import { getAllProjects } from '@/lib/claude-sessions';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const projects = await getAllProjects();

    // Transform for JSON serialization
    const serialized = projects.map(project => ({
      ...project,
      sessions: project.sessions.map(session => ({
        id: session.id,
        projectPath: session.projectPath,
        projectName: session.projectName,
        summaries: session.summaries,
        customName: session.customName,
        lastModified: session.lastModified.toISOString(),
        firstMessage: session.firstMessage?.slice(0, 200),
        messageCount: session.messages.filter(m => m.type === 'user' || m.type === 'assistant').length,
      })),
    }));

    return NextResponse.json(serialized);
  } catch (error) {
    console.error('Error fetching sessions:', error);
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
  }
}
