import { NextResponse } from 'next/server';
import { getAllProjects } from '@/lib/claude-sessions';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const dynamic = 'force-dynamic';

// Load tags data
function loadTags(): Record<string, string[]> {
  const TAGS_FILE = path.join(os.homedir(), '.claude', 'claude-hub-tags.json');
  try {
    if (fs.existsSync(TAGS_FILE)) {
      const content = fs.readFileSync(TAGS_FILE, 'utf8');
      const data = JSON.parse(content);
      return data.sessionTags || {};
    }
  } catch (error) {
    console.error('Failed to load tags:', error);
  }
  return {};
}

// Load user data
interface UserData {
  favorites: string[];
  archived: string[];
  customNames: Record<string, string>;
  notes: Record<string, string>;
}

function loadUserData(): UserData {
  const USER_DATA_FILE = path.join(os.homedir(), '.claude', 'claude-hub-user-data.json');
  try {
    if (fs.existsSync(USER_DATA_FILE)) {
      const content = fs.readFileSync(USER_DATA_FILE, 'utf8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error('Failed to load user data:', error);
  }
  return { favorites: [], archived: [], customNames: {}, notes: {} };
}

export async function GET() {
  try {
    const projects = await getAllProjects();
    const sessionTags = loadTags();
    const userData = loadUserData();

    // Transform for mobile app
    const serialized = projects.map(project => ({
      name: project.path.split('/').pop() || project.path,
      path: project.path,
      sessions: project.sessions.map(session => ({
        id: session.id,
        provider: session.provider || 'claude',
        projectPath: session.projectPath,
        projectName: session.projectName,
        summaries: session.summaries,
        customName: userData.customNames[session.id] || session.customName,
        lastModified: session.lastModified.toISOString(),
        firstMessage: session.firstMessage?.slice(0, 200),
        messageCount: session.messages.filter(m => m.type === 'user' || m.type === 'assistant').length,
        tags: sessionTags[session.id] || [],
      })),
    }));

    return NextResponse.json(serialized);
  } catch (error) {
    console.error('Error fetching sessions for mobile:', error);
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
  }
}
