import { NextResponse } from 'next/server';
import { db, type Campaign } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const campaignId = Number(id);
  if (!Number.isInteger(campaignId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as { name?: string; archived?: boolean };
  const patch: Record<string, unknown> = {};
  if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim();
  if (typeof body.archived === 'boolean') patch.archived = body.archived;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const [updated] = await db.update<Campaign[]>(`campaigns?id=eq.${campaignId}`, patch);
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(updated);
}

/** Deleting a campaign cascades to its per-contact rows; the contacts stay. */
export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const campaignId = Number(id);
  if (!Number.isInteger(campaignId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  await db.remove(`campaigns?id=eq.${campaignId}`);
  return NextResponse.json({ ok: true });
}
