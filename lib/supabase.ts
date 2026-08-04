// Thin PostgREST wrapper. Server-only: it uses the service role key, which
// bypasses RLS, so this module must never be imported into a client component.
import 'server-only';

type Prefer =
  | 'return=representation'
  | 'return=minimal'
  | 'return=representation,resolution=merge-duplicates';

/**
 * Read config per request rather than at module load. Next imports this module
 * while collecting page data during `next build`, and a build machine has no
 * reason to hold runtime secrets — throwing at import time turns a missing
 * variable into a build failure instead of a clear error on the first request.
 */
function config() {
  const urlBase = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!urlBase || !serviceKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }
  return { urlBase, serviceKey };
}

async function request<T>(
  pathAndQuery: string,
  init: { method: string; body?: unknown; prefer?: Prefer } = { method: 'GET' }
): Promise<T> {
  const { urlBase, serviceKey } = config();

  const headers: Record<string, string> = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };
  if (init.prefer) headers.Prefer = init.prefer;

  const res = await fetch(`${urlBase}/rest/v1/${pathAndQuery}`, {
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
  /** Insert, or update the row that clashes on a unique constraint. */
  upsert: <T>(table: string, body: unknown) =>
    request<T>(table, {
      method: 'POST',
      body,
      prefer: 'return=representation,resolution=merge-duplicates',
    }),
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

export type Campaign = { id: number; name: string; archived: boolean; created_at: string };

export type CampaignContact = {
  id: number;
  campaign_id: number;
  contact_id: number;
  status: string;
  poc: string;
  notes: string;
  updated_at: string;
};

/** Per-campaign fields a client may write. */
export const CAMPAIGN_FIELDS = ['status', 'poc', 'notes'] as const;

/** Columns a client is allowed to write. Anything else in a PATCH is ignored. */
export const EDITABLE_COLUMNS = [
  'school', 'location', 'contact_name', 'role', 'phone',
  'email', 'nexis_poc', 'status', 'notes', 'source',
] as const;
