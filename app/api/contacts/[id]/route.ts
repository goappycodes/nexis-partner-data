import { NextResponse } from 'next/server';
import { db, EDITABLE_COLUMNS, type Contact } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * Accepts { column: value } for the built-in columns and { custom: {key: value} }
 * for user-defined fields. Custom values are merged into the existing jsonb so a
 * partial update doesn't drop the other keys.
 */
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const contactId = Number(id);
  if (!Number.isInteger(contactId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  for (const column of EDITABLE_COLUMNS) {
    if (column in body) patch[column] = String(body[column] ?? '');
  }

  if (body.custom && typeof body.custom === 'object') {
    const [existing] = await db.select<Pick<Contact, 'custom'>[]>(
      `contacts?select=custom&id=eq.${contactId}`
    );
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const merged = { ...(existing.custom ?? {}) };
    for (const [key, value] of Object.entries(body.custom as Record<string, unknown>)) {
      merged[key] = String(value ?? '');
    }
    patch.custom = merged;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const [updated] = await db.update<Contact[]>(`contacts?id=eq.${contactId}`, patch);
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const contactId = Number(id);
  if (!Number.isInteger(contactId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  await db.remove(`contacts?id=eq.${contactId}`);
  return NextResponse.json({ ok: true });
}
