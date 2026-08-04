// Stateless session: the cookie holds an HMAC of the app password. Nothing
// secret is stored client-side and there is no session table to keep.
// Uses Web Crypto so it works in both the edge middleware and route handlers.

export const SESSION_COOKIE = 'nexis_session';

function bytes(input: string) {
  return new TextEncoder().encode(input);
}

/** The one valid cookie value for the current APP_PASSWORD / SESSION_SECRET. */
export async function expectedToken(): Promise<string> {
  const secret = process.env.SESSION_SECRET;
  const password = process.env.APP_PASSWORD;
  if (!secret || !password) throw new Error('SESSION_SECRET and APP_PASSWORD must be set');

  const key = await crypto.subtle.importKey(
    'raw',
    bytes(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, bytes(`nexis-session:${password}`));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Length-independent comparison so we don't leak the token through timing. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function isValidSession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  return safeEqual(token, await expectedToken());
}
