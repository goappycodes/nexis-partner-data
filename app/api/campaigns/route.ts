import { NextResponse } from 'next/server';
import { db, type Campaign } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  const campaigns = await db.select<Campaign[]>('campaigns?select=*&order=created_at.desc');
  return NextResponse.json(campaigns);
}

export async function POST(request: Request) {
  const { name } = (await request.json().catch(() => ({}))) as { name?: string };
  const trimmed = (name ?? '').trim();
  if (!trimmed) {
    return NextResponse.json({ error: 'A campaign name is required' }, { status: 400 });
  }

  const existing = await db.select<Campaign[]>(
    `campaigns?select=id&name=eq.${encodeURIComponent(trimmed)}`
  );
  if (existing.length > 0) {
    return NextResponse.json({ error: 'That campaign already exists' }, { status: 409 });
  }

  const [created] = await db.insert<Campaign[]>('campaigns', { name: trimmed });
  return NextResponse.json(created, { status: 201 });
}
