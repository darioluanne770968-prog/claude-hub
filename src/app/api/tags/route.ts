import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

const TAGS_FILE = path.join(os.homedir(), '.claude', 'claude-hub-tags.json');

interface TagData {
  sessionTags: Record<string, string[]>; // sessionId -> tags
  allTags: string[]; // All unique tags
}

function loadTags(): TagData {
  try {
    if (fs.existsSync(TAGS_FILE)) {
      const content = fs.readFileSync(TAGS_FILE, 'utf8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error('Failed to load tags:', error);
  }
  return { sessionTags: {}, allTags: [] };
}

function saveTags(data: TagData) {
  const dir = path.dirname(TAGS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(TAGS_FILE, JSON.stringify(data, null, 2));
}

// GET - Get all tags or tags for a specific session
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('sessionId');
  const data = loadTags();

  if (sessionId) {
    return NextResponse.json({
      tags: data.sessionTags[sessionId] || [],
    });
  }

  return NextResponse.json({
    allTags: data.allTags,
    sessionTags: data.sessionTags,
  });
}

// POST - Add a tag to a session
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, tag } = body;

    if (!sessionId || !tag) {
      return NextResponse.json({ error: 'Missing sessionId or tag' }, { status: 400 });
    }

    const normalizedTag = tag.trim().toLowerCase();
    if (!normalizedTag) {
      return NextResponse.json({ error: 'Tag cannot be empty' }, { status: 400 });
    }

    const data = loadTags();

    // Add tag to session
    if (!data.sessionTags[sessionId]) {
      data.sessionTags[sessionId] = [];
    }
    if (!data.sessionTags[sessionId].includes(normalizedTag)) {
      data.sessionTags[sessionId].push(normalizedTag);
    }

    // Add to allTags if new
    if (!data.allTags.includes(normalizedTag)) {
      data.allTags.push(normalizedTag);
      data.allTags.sort();
    }

    saveTags(data);

    return NextResponse.json({
      success: true,
      tags: data.sessionTags[sessionId],
    });
  } catch (error) {
    console.error('Failed to add tag:', error);
    return NextResponse.json({ error: 'Failed to add tag' }, { status: 500 });
  }
}

// DELETE - Remove a tag from a session
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, tag } = body;

    if (!sessionId || !tag) {
      return NextResponse.json({ error: 'Missing sessionId or tag' }, { status: 400 });
    }

    const data = loadTags();

    if (data.sessionTags[sessionId]) {
      data.sessionTags[sessionId] = data.sessionTags[sessionId].filter(t => t !== tag);
      if (data.sessionTags[sessionId].length === 0) {
        delete data.sessionTags[sessionId];
      }
    }

    // Check if tag is still used by any session
    const tagStillUsed = Object.values(data.sessionTags).some(tags => tags.includes(tag));
    if (!tagStillUsed) {
      data.allTags = data.allTags.filter(t => t !== tag);
    }

    saveTags(data);

    return NextResponse.json({
      success: true,
      tags: data.sessionTags[sessionId] || [],
    });
  } catch (error) {
    console.error('Failed to remove tag:', error);
    return NextResponse.json({ error: 'Failed to remove tag' }, { status: 500 });
  }
}
