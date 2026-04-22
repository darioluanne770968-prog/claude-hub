import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Simple password protection
const PASSWORD = process.env.AUTH_PASSWORD || 'claude2024';

export function middleware(request: NextRequest) {
  // Check if already authenticated via cookie
  const authCookie = request.cookies.get('claude-hub-auth');

  // Allow access to all API routes (for Electron app and mobile sync)
  // APIs are local-only and don't need password protection
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Check authentication
  if (authCookie?.value === PASSWORD) {
    return NextResponse.next();
  }

  // Redirect to login page if not on login page
  if (request.nextUrl.pathname !== '/login') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
