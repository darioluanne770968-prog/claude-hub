import { NextRequest, NextResponse } from 'next/server';
import { connectToHost } from '@/lib/ssh-client';
import { RemoteHost } from '@/lib/remote-hosts';

// POST - Test connection to a remote host
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Create a temporary host config for testing
    const host: RemoteHost = {
      id: 'test',
      name: body.name || 'Test',
      hostname: body.hostname,
      port: body.port || 22,
      username: body.username,
      privateKeyPath: body.privateKeyPath,
      claudePath: body.claudePath || '~/.claude',
      enabled: true,
      os: body.os || 'macos',
    };

    // Try to connect
    const { client, sftp } = await connectToHost(host);

    // Close the connection
    client.end();

    return NextResponse.json({
      success: true,
      message: `成功连接到 ${host.hostname}`,
    });
  } catch (error) {
    console.error('SSH connection test failed:', error);
    return NextResponse.json(
      {
        success: false,
        message: `连接失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
      },
      { status: 400 }
    );
  }
}
