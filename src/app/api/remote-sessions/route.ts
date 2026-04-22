import { NextRequest, NextResponse } from 'next/server';
import { getEnabledHosts } from '@/lib/remote-hosts';
import { fetchRemoteSessions } from '@/lib/ssh-client';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Cache configuration
const CACHE_DIR = path.join(os.homedir(), '.claude-hub', 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'remote-sessions.json');
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours cache

interface CacheData {
  timestamp: number;
  data: {
    projects: unknown[];
    errors: Array<{ hostName: string; error: string }>;
  };
}

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function readCache(): CacheData | null {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const content = fs.readFileSync(CACHE_FILE, 'utf8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error('Failed to read cache:', error);
  }
  return null;
}

function writeCache(data: CacheData['data']) {
  try {
    ensureCacheDir();
    const cacheData: CacheData = {
      timestamp: Date.now(),
      data,
    };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheData), 'utf8');
  } catch (error) {
    console.error('Failed to write cache:', error);
  }
}

function isCacheValid(cache: CacheData): boolean {
  return Date.now() - cache.timestamp < CACHE_TTL;
}

// GET - Fetch sessions from all enabled remote hosts
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('refresh') === 'true';

    // Try to use cache unless force refresh
    if (!forceRefresh) {
      const cache = readCache();
      if (cache && isCacheValid(cache)) {
        console.log('Using cached remote sessions');
        return NextResponse.json(cache.data);
      }
    }

    const hosts = getEnabledHosts();

    if (hosts.length === 0) {
      const emptyData = { projects: [], errors: [] };
      writeCache(emptyData);
      return NextResponse.json(emptyData);
    }

    console.log(`Fetching remote sessions from ${hosts.length} hosts...`);

    // Fetch sessions from all hosts in parallel
    const results = await Promise.allSettled(
      hosts.map(async (host) => {
        try {
          const projects = await fetchRemoteSessions(host);
          return { host, projects, error: null };
        } catch (error) {
          console.error(`Failed to fetch from ${host.name}:`, error);
          return { host, projects: [], error: error instanceof Error ? error.message : 'Unknown error' };
        }
      })
    );

    // Aggregate results
    const allProjects: Array<{
      name: string;
      path: string;
      sessions: Array<{
        id: string;
        projectPath: string;
        projectName: string;
        summaries: string[];
        customName?: string;
        lastModified: string;
        firstMessage?: string;
        messageCount: number;
        source: {
          type: 'remote';
          hostId: string;
          hostName: string;
        };
      }>;
    }> = [];

    const errors: Array<{ hostName: string; error: string }> = [];

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { host, projects, error } = result.value;
        if (error) {
          errors.push({ hostName: host.name, error });
        }
        allProjects.push(...projects);
      } else {
        console.error('Unexpected rejection:', result.reason);
      }
    }

    const responseData = {
      projects: allProjects,
      errors,
    };

    // Save to cache
    writeCache(responseData);

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Failed to fetch remote sessions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch remote sessions', projects: [], errors: [] },
      { status: 500 }
    );
  }
}
