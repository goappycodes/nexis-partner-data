import { NextResponse } from 'next/server';
import { db, CAMPAIGN_FIELDS, type CampaignContact } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const campaignId = Number(new URL(request.url).searchParams.get('campaignId'));
  if (!Number.isInteger(campaignId)) {
    return NextResponse.json({ error: 'campaignId is required' }, { status: 400 });
  }
  const rows = await db.select<CampaignContact[]>(
    `campaign_contacts?select=*&campaign_id=eq.${campaignId}`
  );
  return NextResponse.json(rows);
}

/**
 * Records one field for one contact in one campaign, creating the row on first
 * write. Upsert is done with Prefer: resolution=merge-duplicates against the
 * (campaign_id, contact_id) unique constraint, so concurrent edits from two
 * browsers can't produce a duplicate pair.
 */
export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    campaignId?: number;
    contactId?: number;
    field?: string;
    value?: string;
  };

  const campaignId = Number(body.campaignId);
  const contactId = Number(body.contactId);
  const field = String(body.field ?? '');

  if (!Number.isInteger(campaignId) || !Number.isInteger(contactId)) {
    return NextResponse.json({ error: 'campaignId and contactId are required' }, { status: 400 });
  }
  if (!(CAMPAIGN_FIELDS as readonly string[]).includes(field)) {
    return NextResponse.json({ error: `Unknown field "${field}"` }, { status: 400 });
  }

  const [row] = await db.upsert<CampaignContact[]>('campaign_contacts', {
    campaign_id: campaignId,
    contact_id: contactId,
    [field]: String(body.value ?? ''),
  });
  return NextResponse.json(row);
}
