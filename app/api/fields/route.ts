import { NextResponse } from 'next/server';
import { db, type CustomField } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/** Slug used as the jsonb key in contacts.custom. */
function toKey(label: string) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

export async function GET() {
  const fields = await db.select<CustomField[]>('custom_fields?select=*&order=position.asc,id.asc');
  return NextResponse.json(fields);
}

export async function POST(request: Request) {
  const { label } = (await request.json().catch(() => ({}))) as { label?: string };
  const trimmed = (label ?? '').trim();
  const key = toKey(trimmed);
  if (!trimmed || !key) {
    return NextResponse.json({ error: 'A field name is required' }, { status: 400 });
  }

  const existing = await db.select<CustomField[]>(
    `custom_fields?select=id&key=eq.${encodeURIComponent(key)}`
  );
  if (existing.length > 0) {
    return NextResponse.json({ error: 'A field with that name already exists' }, { status: 409 });
  }

  const all = await db.select<CustomField[]>('custom_fields?select=position');
  const position = all.reduce((max, f) => Math.max(max, f.position), 0) + 1;

  const [created] = await db.insert<CustomField[]>('custom_fields', { key, label: trimmed, position });
  return NextResponse.json(created, { status: 201 });
}
