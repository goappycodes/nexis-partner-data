// Loads All_School_Contacts.csv into the contacts table.
// Default: only seeds when the table is empty. Pass --force to wipe and reload.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from './db.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSV = path.join(ROOT, 'All_School_Contacts.csv');
const force = process.argv.includes('--force');

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false, i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const rows = parseCSV(fs.readFileSync(CSV, 'utf8')).filter((r) => r.some((c) => c.trim() !== ''));
const header = rows.shift();
const idx = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
const get = (r, name) => (r[idx[name]] ?? '').trim();

const records = rows.map((r) => [
  get(r, 'School'), get(r, 'Location'), get(r, 'ContactName'), get(r, 'Role'),
  get(r, 'Phone'), get(r, 'Email'), get(r, 'NexisPOC'), get(r, 'Status'),
  get(r, 'Notes'), get(r, 'Source'),
]);

const client = await connect();
try {
  const { rows: [{ count }] } = await client.query('select count(*)::int as count from contacts');
  if (count > 0 && !force) {
    console.log(`contacts already has ${count} rows — skipping. Re-run with --force to reload.`);
    process.exit(0);
  }
  if (force && count > 0) {
    // comments cascade from contacts, so clear them explicitly to be obvious.
    await client.query('truncate comments, contacts restart identity cascade');
    console.log(`cleared ${count} existing rows`);
  }

  const COLS = ['school', 'location', 'contact_name', 'role', 'phone', 'email', 'nexis_poc', 'status', 'notes', 'source'];
  const CHUNK = 100;
  let inserted = 0;
  for (let start = 0; start < records.length; start += CHUNK) {
    const chunk = records.slice(start, start + CHUNK);
    const values = [];
    const placeholders = chunk.map((rec, r) => {
      values.push(...rec);
      return `(${COLS.map((_, c) => `$${r * COLS.length + c + 1}`).join(',')})`;
    });
    await client.query(
      `insert into contacts (${COLS.join(',')}) values ${placeholders.join(',')}`,
      values
    );
    inserted += chunk.length;
  }
  console.log(`inserted ${inserted} contacts`);
} finally {
  await client.end();
}
