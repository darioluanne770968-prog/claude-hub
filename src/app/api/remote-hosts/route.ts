import { NextRequest, NextResponse } from 'next/server';
import {
  loadRemoteHosts,
  addRemoteHost,
  deleteRemoteHost,
  updateRemoteHost,
  RemoteHost,
} from '@/lib/remote-hosts';
import { connectToHost } from '@/lib/ssh-client';

// GET - List all remote hosts
export async function GET() {
  try {
    const config = loadRemoteHosts();
    return NextResponse.json(config.hosts);
  } catch (error) {
    console.error('Failed to load remote hosts:', error);
    return NextResponse.json({ error: 'Failed to load remote hosts' }, { status: 500 });
  }
}

// POST - Add a new remote host
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    const requiredFields = ['name', 'hostname', 'username', 'privateKeyPath', 'claudePath'];
    for (const field of requiredFields) {
      if (!body[field]) {
        return NextResponse.json({ error: `Missing required field: ${field}` }, { status: 400 });
      }
    }

    const newHost = addRemoteHost({
      name: body.name,
      hostname: body.hostname,
      port: body.port || 22,
      username: body.username,
      privateKeyPath: body.privateKeyPath,
      claudePath: body.claudePath,
      enabled: body.enabled ?? true,
      os: body.os || 'macos',
    });

    return NextResponse.json(newHost);
  } catch (error) {
    console.error('Failed to add remote host:', error);
    return NextResponse.json({ error: 'Failed to add remote host' }, { status: 500 });
  }
}

// PUT - Update a remote host
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.id) {
      return NextResponse.json({ error: 'Missing host id' }, { status: 400 });
    }

    const updated = updateRemoteHost(body.id, body);
    if (!updated) {
      return NextResponse.json({ error: 'Host not found' }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Failed to update remote host:', error);
    return NextResponse.json({ error: 'Failed to update remote host' }, { status: 500 });
  }
}

// DELETE - Delete a remote host
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing host id' }, { status: 400 });
    }

    const deleted = deleteRemoteHost(id);
    if (!deleted) {
      return NextResponse.json({ error: 'Host not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete remote host:', error);
    return NextResponse.json({ error: 'Failed to delete remote host' }, { status: 500 });
  }
}
