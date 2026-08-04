// Shared helpers for the DB scripts: env loading + Postgres connection discovery.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Minimal .env.local loader — values are taken literally after the first "=". */
export function loadEnv() {
  const file = path.join(ROOT, '.env.local');
  if (!fs.existsSync(file)) throw new Error('.env.local not found');
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!process.env[key]) process.env[key] = trimmed.slice(eq + 1);
  }
}

// Supabase exposes the database on a direct host (often IPv6-only) and on
// regional poolers. We don't know the region up front, so try the likely hosts
// and keep whichever connects first.
const POOLER_REGIONS = [
  'ap-south-1', 'ap-southeast-1', 'us-east-1', 'us-east-2',
  'us-west-1', 'eu-west-1', 'eu-central-1', 'ap-northeast-1',
];

function candidates(ref, password) {
  const list = [{
    label: `direct db.${ref}.supabase.co`,
    config: { host: `db.${ref}.supabase.co`, port: 5432, user: 'postgres', password, database: 'postgres' },
  }];
  for (const prefix of ['aws-0', 'aws-1']) {
    for (const region of POOLER_REGIONS) {
      list.push({
        label: `pooler ${prefix}-${region}`,
        // Port 5432 on the pooler is session mode, which supports DDL.
        config: {
          host: `${prefix}-${region}.pooler.supabase.com`,
          port: 5432,
          user: `postgres.${ref}`,
          password,
          database: 'postgres',
        },
      });
    }
  }
  return list;
}

/** Returns a connected pg.Client, trying each candidate host in turn. */
export async function connect() {
  loadEnv();
  const ref = process.env.SUPABASE_PROJECT_REF;
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!ref || !password) throw new Error('SUPABASE_PROJECT_REF and SUPABASE_DB_PASSWORD are required');

  const errors = [];
  for (const { label, config } of candidates(ref, password)) {
    const client = new pg.Client({
      ...config,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 8000,
      statement_timeout: 120000,
    });
    try {
      await client.connect();
      console.log(`connected via ${label}`);
      return client;
    } catch (err) {
      errors.push(`${label}: ${err.message}`);
      try { await client.end(); } catch {}
    }
  }
  throw new Error(`could not connect to Postgres.\n${errors.join('\n')}`);
}
