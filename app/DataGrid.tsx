'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Drawer from './Drawer';
import EditableCell from './EditableCell';
import {
  CAMPAIGN_COLUMNS, EMPTY_CAMPAIGN_ENTRY, GRID_COLUMNS,
  type Campaign, type CampaignEntry, type Contact, type CustomField,
} from './types';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type SortDir = 'asc' | 'desc';

const CUSTOM_PREFIX = 'custom:';
const CAMPAIGN_PREFIX = 'campaign:';

type CampaignEntries = Record<number, CampaignEntry>;

function valueOf(contact: Contact, key: string, entries: CampaignEntries): string {
  if (key.startsWith(CUSTOM_PREFIX)) return contact.custom?.[key.slice(CUSTOM_PREFIX.length)] ?? '';
  if (key.startsWith(CAMPAIGN_PREFIX)) {
    const field = key.slice(CAMPAIGN_PREFIX.length) as keyof CampaignEntry;
    return entries[contact.id]?.[field] ?? '';
  }
  return (contact as unknown as Record<string, string>)[key] ?? '';
}

/** Mirrors what the server does to a row, so the grid can update before the request lands. */
function applyPatch(contact: Contact, patch: Record<string, unknown>): Contact {
  const next = { ...contact };
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'custom' && value && typeof value === 'object') {
      next.custom = { ...(next.custom ?? {}) };
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        next.custom[k] = String(v ?? '');
      }
    } else {
      (next as unknown as Record<string, unknown>)[key] = String(value ?? '');
    }
  }
  return next;
}

export default function DataGrid() {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [fields, setFields] = useState<CustomField[]>([]);
  const [commentCounts, setCommentCounts] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [source, setSource] = useState('');
  const [phoneFilter, setPhoneFilter] = useState<'' | 'has' | 'missing'>('');
  const [sortKey, setSortKey] = useState<string>('school');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const [openId, setOpenId] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const pending = useRef(0);

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState<number | null>(null);
  const [entries, setEntries] = useState<CampaignEntries>({});

  const load = useCallback(async () => {
    const res = await fetch('/api/contacts');
    if (res.status === 401) {
      router.replace('/login');
      return;
    }
    const data = await res.json();
    setContacts(data.contacts ?? []);
    setFields(data.fields ?? []);
    setCommentCounts(data.commentCounts ?? {});
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  // Remember the campaign being worked on across reloads.
  useEffect(() => {
    fetch('/api/campaigns')
      .then((r) => r.json())
      .then((list: Campaign[]) => {
        if (!Array.isArray(list)) return;
        setCampaigns(list);
        const saved = Number(window.localStorage.getItem('nexis_campaign'));
        if (list.some((c) => c.id === saved)) setCampaignId(saved);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (campaignId === null) {
      setEntries({});
      window.localStorage.removeItem('nexis_campaign');
      return;
    }
    window.localStorage.setItem('nexis_campaign', String(campaignId));
    let cancelled = false;
    fetch(`/api/campaign-contacts?campaignId=${campaignId}`)
      .then((r) => r.json())
      .then((rows: { contact_id: number; status: string; poc: string; notes: string }[]) => {
        if (cancelled || !Array.isArray(rows)) return;
        const next: CampaignEntries = {};
        for (const r of rows) {
          next[r.contact_id] = { status: r.status, poc: r.poc, notes: r.notes };
        }
        setEntries(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  const patchCampaign = useCallback(
    async (contactId: number, field: keyof CampaignEntry, value: string) => {
      if (campaignId === null) return;
      setEntries((prev) => ({
        ...prev,
        [contactId]: { ...(prev[contactId] ?? EMPTY_CAMPAIGN_ENTRY), [field]: value },
      }));
      pending.current += 1;
      setSaveState('saving');
      try {
        const res = await fetch('/api/campaign-contacts', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ campaignId, contactId, field, value }),
        });
        if (!res.ok) throw new Error(String(res.status));
        pending.current -= 1;
        if (pending.current === 0) setSaveState('saved');
      } catch {
        pending.current -= 1;
        setSaveState('error');
      }
    },
    [campaignId]
  );

  async function addCampaign() {
    const name = prompt('Name of the new campaign (e.g. "School workshops 2027")');
    if (!name?.trim()) return;
    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (res.ok) {
      const created: Campaign = await res.json();
      setCampaigns((prev) => [created, ...prev]);
      setCampaignId(created.id);
    } else {
      const { error } = await res.json().catch(() => ({ error: 'Could not create campaign' }));
      alert(error);
    }
  }

  const patchContact = useCallback(async (id: number, patch: Record<string, unknown>) => {
    setContacts((prev) => prev.map((c) => (c.id === id ? applyPatch(c, patch) : c)));
    pending.current += 1;
    setSaveState('saving');
    try {
      const res = await fetch(`/api/contacts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(String(res.status));
      const updated: Contact = await res.json();
      setContacts((prev) => prev.map((c) => (c.id === id ? updated : c)));
      pending.current -= 1;
      if (pending.current === 0) setSaveState('saved');
    } catch {
      pending.current -= 1;
      setSaveState('error');
    }
  }, []);

  useEffect(() => {
    if (saveState !== 'saved') return;
    const t = setTimeout(() => setSaveState('idle'), 1600);
    return () => clearTimeout(t);
  }, [saveState]);

  async function addContact() {
    const res = await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!res.ok) return;
    const created: Contact = await res.json();
    setContacts((prev) => [created, ...prev]);
    setOpenId(created.id);
  }

  async function addField() {
    const label = prompt('Name of the new field (e.g. "Last contacted")');
    if (!label?.trim()) return;
    const res = await fetch('/api/fields', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: label.trim() }),
    });
    if (res.ok) {
      const created: CustomField = await res.json();
      setFields((prev) => [...prev, created]);
    } else {
      const { error } = await res.json().catch(() => ({ error: 'Could not add field' }));
      alert(error);
    }
  }

  async function removeField(field: CustomField) {
    if (!confirm(`Remove the "${field.label}" column? Existing values are kept and will reappear if you add it back.`)) {
      return;
    }
    setFields((prev) => prev.filter((f) => f.id !== field.id));
    await fetch(`/api/fields/${field.id}`, { method: 'DELETE' });
  }

  async function deleteContact(id: number) {
    setContacts((prev) => prev.filter((c) => c.id !== id));
    setOpenId(null);
    await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
  }

  const adjustCommentCount = useCallback((contactId: number, delta: number) => {
    setCommentCounts((prev) => {
      const next = Math.max(0, (prev[contactId] ?? 0) + delta);
      return { ...prev, [contactId]: next };
    });
  }, []);

  const locations = useMemo(
    () => [...new Set(contacts.map((c) => c.location).filter(Boolean))].sort(),
    [contacts]
  );
  // A merged contact carries every sheet it came from ("Udaan; ISBF"), so the
  // filter lists the individual sheets and matches any contact mentioning one.
  const sourcesOf = (c: Contact) => c.source.split(';').map((s) => s.trim()).filter(Boolean);

  const sources = useMemo(
    () => [...new Set(contacts.flatMap(sourcesOf))].sort(),
    [contacts]
  );

  const columns = useMemo(
    () => [
      ...GRID_COLUMNS.map((c) => ({ key: c.key as string, label: c.label, field: null as CustomField | null })),
      // Campaign columns sit next to the contact details rather than at the far
      // right, because when a campaign is selected they are what's being worked on.
      ...(campaignId === null
        ? []
        : CAMPAIGN_COLUMNS.map((c) => ({
            key: `${CAMPAIGN_PREFIX}${c.key}`,
            label: c.label,
            field: null as CustomField | null,
          }))),
      ...fields.map((f) => ({ key: `${CUSTOM_PREFIX}${f.key}`, label: f.label, field: f })),
    ],
    [fields, campaignId]
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = contacts.filter((c) => {
      if (location && c.location !== location) return false;
      if (source && !sourcesOf(c).includes(source)) return false;
      const hasPhone = c.phone.trim() !== '';
      if (phoneFilter === 'has' && !hasPhone) return false;
      if (phoneFilter === 'missing' && hasPhone) return false;
      if (!needle) return true;
      const entry = entries[c.id];
      const haystack = [
        c.school, c.location, c.contact_name, c.role, c.phone,
        c.email, c.nexis_poc, c.status, c.notes, c.source,
        ...Object.values(c.custom ?? {}),
        entry?.status ?? '', entry?.poc ?? '', entry?.notes ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });

    const dir = sortDir === 'asc' ? 1 : -1;
    return filtered.sort((a, b) => {
      const av = valueOf(a, sortKey, entries);
      const bv = valueOf(b, sortKey, entries);
      // Blanks always sort to the bottom rather than clumping at the top.
      if (!av && bv) return 1;
      if (av && !bv) return -1;
      return av.localeCompare(bv, undefined, { sensitivity: 'base' }) * dir;
    });
  }, [contacts, query, location, source, phoneFilter, sortKey, sortDir, entries]);

  const missingPhoneCount = useMemo(
    () => contacts.filter((c) => c.phone.trim() === '').length,
    [contacts]
  );

  function toggleSort(key: string) {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const open = openId === null ? null : contacts.find((c) => c.id === openId) ?? null;
  const activeCampaign = campaigns.find((c) => c.id === campaignId) ?? null;

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Nexis Partner Data</span>
        <input
          className="search"
          placeholder="Search name, school, phone, email, notes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className="select" value={location} onChange={(e) => setLocation(e.target.value)}>
          <option value="">All locations</option>
          {locations.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
        <select className="select" value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">All sources</option>
          {sources.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          className="select"
          value={phoneFilter}
          onChange={(e) => setPhoneFilter(e.target.value as '' | 'has' | 'missing')}
        >
          <option value="">Any number</option>
          <option value="has">Has a number</option>
          <option value="missing">Missing number ({missingPhoneCount})</option>
        </select>
        <select
          className="select select-campaign"
          value={campaignId ?? ''}
          onChange={(e) => {
            if (e.target.value === 'new') addCampaign();
            else setCampaignId(e.target.value === '' ? null : Number(e.target.value));
          }}
        >
          <option value="">No campaign</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
          <option value="new">+ New campaign…</option>
        </select>
        <span className="count">
          {visible.length}
          {visible.length !== contacts.length ? ` / ${contacts.length}` : ''} contacts
        </span>
        <span className={`saving ${saveState === 'saved' ? 'ok' : ''} ${saveState === 'error' ? 'err' : ''}`}>
          {saveState === 'saving' && 'Saving…'}
          {saveState === 'saved' && 'Saved'}
          {saveState === 'error' && 'Save failed'}
        </span>
        <button className="btn" onClick={addField}>+ Field</button>
        <button className="btn btn-accent" onClick={addContact}>+ Contact</button>
        <button
          className="btn"
          onClick={async () => {
            await fetch('/api/logout', { method: 'POST' });
            router.replace('/login');
          }}
        >
          Log out
        </button>
      </header>

      <div className="table-scroll">
        {loading ? (
          <div className="empty">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="empty">No contacts match this filter.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th />
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`sortable${col.key.startsWith(CAMPAIGN_PREFIX) ? ' col-campaign' : ''}`}
                    onClick={() => toggleSort(col.key)}
                    title={
                      col.field
                        ? 'Custom field — double-click to remove'
                        : col.key.startsWith(CAMPAIGN_PREFIX)
                          ? `Recorded against "${activeCampaign?.name ?? ''}" only`
                          : 'Click to sort'
                    }
                    onDoubleClick={() => col.field && removeField(col.field)}
                  >
                    {col.label}
                    {sortKey === col.key && (
                      <span className="arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((contact) => (
                <tr key={contact.id}>
                  <td className="col-open">
                    <button
                      className="open-btn"
                      onClick={() => setOpenId(contact.id)}
                      aria-label="Open details"
                    >
                      ›
                      {commentCounts[contact.id] > 0 && (
                        <span className="badge">{commentCounts[contact.id]}</span>
                      )}
                    </button>
                  </td>
                  {columns.map((col) => (
                    <td key={col.key} className={col.key.startsWith(CAMPAIGN_PREFIX) ? 'col-campaign' : undefined}>
                      <EditableCell
                        value={valueOf(contact, col.key, entries)}
                        onCommit={(next) => {
                          if (col.key.startsWith(CAMPAIGN_PREFIX)) {
                            patchCampaign(
                              contact.id,
                              col.key.slice(CAMPAIGN_PREFIX.length) as keyof CampaignEntry,
                              next
                            );
                          } else {
                            patchContact(
                              contact.id,
                              col.key.startsWith(CUSTOM_PREFIX)
                                ? { custom: { [col.key.slice(CUSTOM_PREFIX.length)]: next } }
                                : { [col.key]: next }
                            );
                          }
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {open && (
        <Drawer
          contact={open}
          fields={fields}
          campaign={activeCampaign}
          entry={entries[open.id] ?? EMPTY_CAMPAIGN_ENTRY}
          onCampaignPatch={patchCampaign}
          onClose={() => setOpenId(null)}
          onPatch={patchContact}
          onDelete={deleteContact}
          onCommentCountChange={adjustCommentCount}
        />
      )}
    </div>
  );
}
