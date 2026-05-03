import { NextResponse } from 'next/server';

const PASSWORD = process.env.AUTH_PASSWORD;

if (!PASSWORD) {
  console.error('AUTH_PASSWORD environment variable is not set');
}

export async function POST(request: Request) {
  try {
    if (!PASSWORD) {
      return NextResponse.json({ error: 'Auth not configured' }, { status: 500 });
    }

    const { password } = await request.json();

    if (password === PASSWORD) {
      const response = NextResponse.json({ success: true });

      // Set auth cookie (7 days)
      response.cookies.set('claude-hub-auth', PASSWORD, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });

      return response;
    }

    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  } catch {
    return NextResponse.json({ error: 'Auth failed' }, { status: 500 });
  }
}
