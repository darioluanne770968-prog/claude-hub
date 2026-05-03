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

// Load user data (favorites, archived, custom names, notes)
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

    // Transform for JSON serialization
    const serialized = projects.map(project => ({
      ...project,
      sessions: project.sessions.map(session => ({
        id: session.id,
        provider: session.provider || 'claude',
        projectPath: session.projectPath,
        projectName: session.projectName,
        originalProjectPath: session.originalProjectPath,
        summaries: session.summaries,
        summariesWithTimestamps: session.summariesWithTimestamps,
        // JSONL is the source of truth (so terminal /rename and Hub renames stay in sync).
        // Fall back to user-data.json for legacy entries renamed before bidirectional sync existed.
        customName: session.customName || userData.customNames[session.id],
        lastModified: session.lastModified.toISOString(),
        firstMessage: session.firstMessage?.slice(0, 200),
        messageCount: session.messages.filter(m => m.type === 'user' || m.type === 'assistant').length,
        isIde: session.isIde,
        tags: sessionTags[session.id] || [],
        isFavorite: userData.favorites.includes(session.id),
        isArchived: userData.archived.includes(session.id),
        hasNote: !!userData.notes[session.id],
      })),
    }));

    // Also return favorites and archived lists for filtering
    return NextResponse.json({
      projects: serialized,
      favorites: userData.favorites,
      archived: userData.archived,
    });
  } catch (error) {
    console.error('Error fetching sessions:', error);
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
  }
}
