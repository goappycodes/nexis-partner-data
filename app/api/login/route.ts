import { NextResponse } from 'next/server';
import { SESSION_COOKIE, expectedToken, safeEqual } from '@/lib/auth';

export async function POST(request: Request) {
  const { password } = (await request.json().catch(() => ({}))) as { password?: string };
  const appPassword = process.env.APP_PASSWORD;

  if (!password || !appPassword || !safeEqual(password, appPassword)) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await expectedToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return response;
}
