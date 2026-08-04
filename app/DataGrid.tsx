'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Drawer from './Drawer';
import EditableCell from './EditableCell';
import { GRID_COLUMNS, type Contact, type CustomField } from './types';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type SortDir = 'asc' | 'desc';

const CUSTOM_PREFIX = 'custom:';

function valueOf(contact: Contact, key: string): string {
  if (key.startsWith(CUSTOM_PREFIX)) return contact.custom?.[key.slice(CUSTOM_PREFIX.length)] ?? '';
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
  const [sortKey, setSortKey] = useState<string>('school');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const [openId, setOpenId] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const pending = useRef(0);

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
  const sources = useMemo(
    () => [...new Set(contacts.map((c) => c.source).filter(Boolean))].sort(),
    [contacts]
  );

  const columns = useMemo(
    () => [
      ...GRID_COLUMNS.map((c) => ({ key: c.key as string, label: c.label, field: null as CustomField | null })),
      ...fields.map((f) => ({ key: `${CUSTOM_PREFIX}${f.key}`, label: f.label, field: f })),
    ],
    [fields]
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = contacts.filter((c) => {
      if (location && c.location !== location) return false;
      if (source && c.source !== source) return false;
      if (!needle) return true;
      const haystack = [
        c.school, c.location, c.contact_name, c.role, c.phone,
        c.email, c.nexis_poc, c.status, c.notes, c.source,
        ...Object.values(c.custom ?? {}),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });

    const dir = sortDir === 'asc' ? 1 : -1;
    return filtered.sort((a, b) => {
      const av = valueOf(a, sortKey);
      const bv = valueOf(b, sortKey);
      // Blanks always sort to the bottom rather than clumping at the top.
      if (!av && bv) return 1;
      if (av && !bv) return -1;
      return av.localeCompare(bv, undefined, { sensitivity: 'base' }) * dir;
    });
  }, [contacts, query, location, source, sortKey, sortDir]);

  function toggleSort(key: string) {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const open = openId === null ? null : contacts.find((c) => c.id === openId) ?? null;

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
                    className="sortable"
                    onClick={() => toggleSort(col.key)}
                    title={col.field ? 'Custom field — double-click to remove' : 'Click to sort'}
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
                    <td key={col.key}>
                      <EditableCell
                        value={valueOf(contact, col.key)}
                        onCommit={(next) =>
                          patchContact(
                            contact.id,
                            col.key.startsWith(CUSTOM_PREFIX)
                              ? { custom: { [col.key.slice(CUSTOM_PREFIX.length)]: next } }
                              : { [col.key]: next }
                          )
                        }
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
          onClose={() => setOpenId(null)}
          onPatch={patchContact}
          onDelete={deleteContact}
          onCommentCountChange={adjustCommentCount}
        />
      )}
    </div>
  );
}
