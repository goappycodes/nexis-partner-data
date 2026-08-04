import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, isValidSession } from '@/lib/auth';

// Everything except the login screen and the login endpoint requires a session.
const PUBLIC_PATHS = new Set(['/login', '/api/login']);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  if (await isValidSession(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }

  // API callers get a status they can act on; page requests get the login screen.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const loginUrl = new URL('/login', request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Skip Next internals and static files.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
