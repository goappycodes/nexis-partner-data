// Thin PostgREST wrapper. Server-only: it uses the service role key, which
// bypasses RLS, so this module must never be imported into a client component.
import 'server-only';

const URL_BASE = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_BASE || !SERVICE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
}

type Prefer = 'return=representation' | 'return=minimal';

async function request<T>(
  pathAndQuery: string,
  init: { method: string; body?: unknown; prefer?: Prefer } = { method: 'GET' }
): Promise<T> {
  const headers: Record<string, string> = {
    apikey: SERVICE_KEY!,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };
  if (init.prefer) headers.Prefer = init.prefer;

  const res = await fetch(`${URL_BASE}/rest/v1/${pathAndQuery}`, {
    method: init.method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store',
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Supabase ${init.method} ${pathAndQuery} failed (${res.status}): ${text}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}

export const db = {
  select: <T>(pathAndQuery: string) => request<T>(pathAndQuery),
  insert: <T>(table: string, body: unknown) =>
    request<T>(table, { method: 'POST', body, prefer: 'return=representation' }),
  update: <T>(pathAndQuery: string, body: unknown) =>
    request<T>(pathAndQuery, { method: 'PATCH', body, prefer: 'return=representation' }),
  remove: (pathAndQuery: string) =>
    request<null>(pathAndQuery, { method: 'DELETE', prefer: 'return=minimal' }),
};

export type Contact = {
  id: number;
  school: string;
  location: string;
  contact_name: string;
  role: string;
  phone: string;
  email: string;
  nexis_poc: string;
  status: string;
  notes: string;
  source: string;
  custom: Record<string, string>;
  created_at: string;
  updated_at: string;
};

export type CustomField = { id: number; key: string; label: string; position: number };

export type Comment = {
  id: number;
  contact_id: number;
  author: string;
  body: string;
  created_at: string;
};

/** Columns a client is allowed to write. Anything else in a PATCH is ignored. */
export const EDITABLE_COLUMNS = [
  'school', 'location', 'contact_name', 'role', 'phone',
  'email', 'nexis_poc', 'status', 'notes', 'source',
] as const;
