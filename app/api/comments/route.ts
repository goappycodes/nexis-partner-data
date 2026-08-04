import { NextResponse } from 'next/server';
import { db, type Comment } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const contactId = Number(new URL(request.url).searchParams.get('contactId'));
  if (!Number.isInteger(contactId)) {
    return NextResponse.json({ error: 'contactId is required' }, { status: 400 });
  }
  const comments = await db.select<Comment[]>(
    `comments?select=*&contact_id=eq.${contactId}&order=created_at.desc`
  );
  return NextResponse.json(comments);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    contactId?: number;
    author?: string;
    body?: string;
  };

  const contactId = Number(body.contactId);
  const text = (body.body ?? '').trim();
  if (!Number.isInteger(contactId) || !text) {
    return NextResponse.json({ error: 'contactId and body are required' }, { status: 400 });
  }

  const [created] = await db.insert<Comment[]>('comments', {
    contact_id: contactId,
    author: (body.author ?? '').trim(),
    body: text,
  });
  return NextResponse.json(created, { status: 201 });
}
