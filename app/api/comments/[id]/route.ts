import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const commentId = Number(id);
  if (!Number.isInteger(commentId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  await db.remove(`comments?id=eq.${commentId}`);
  return NextResponse.json({ ok: true });
}
