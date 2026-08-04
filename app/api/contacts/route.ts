import { NextResponse } from 'next/server';
import { db, type Contact, type CustomField } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/** Everything the grid needs in one round trip. */
export async function GET() {
  const [contacts, fields] = await Promise.all([
    db.select<Contact[]>('contacts?select=*&order=school.asc,contact_name.asc'),
    db.select<CustomField[]>('custom_fields?select=*&order=position.asc,id.asc'),
  ]);

  // Comment counts, so the grid can show which rows have discussion on them.
  const comments = await db.select<{ contact_id: number }[]>('comments?select=contact_id');
  const commentCounts: Record<number, number> = {};
  for (const { contact_id } of comments) {
    commentCounts[contact_id] = (commentCounts[contact_id] ?? 0) + 1;
  }

  return NextResponse.json({ contacts, fields, commentCounts });
}

/** Creates a blank row for the user to fill in. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Partial<Contact>;
  const [created] = await db.insert<Contact[]>('contacts', {
    school: body.school ?? '',
    contact_name: body.contact_name ?? '',
    source: body.source ?? 'Added in app',
  });
  return NextResponse.json(created, { status: 201 });
}
