import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * Removes the field definition only. Any values already stored under this key in
 * contacts.custom are left alone, so re-adding a field with the same name brings
 * the old values back rather than losing them.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fieldId = Number(id);
  if (!Number.isInteger(fieldId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  await db.remove(`custom_fields?id=eq.${fieldId}`);
  return NextResponse.json({ ok: true });
}
