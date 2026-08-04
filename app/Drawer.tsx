'use client';

import { useCallback, useEffect, useState } from 'react';
import EditableCell from './EditableCell';
import { ALL_COLUMNS, type Comment, type Contact, type CustomField } from './types';

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function Drawer({
  contact,
  fields,
  onClose,
  onPatch,
  onDelete,
  onCommentCountChange,
}: {
  contact: Contact;
  fields: CustomField[];
  onClose: () => void;
  onPatch: (id: number, patch: Record<string, unknown>) => void;
  onDelete: (id: number) => void;
  onCommentCountChange: (contactId: number, delta: number) => void;
}) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [author, setAuthor] = useState('');
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);

  const contactId = contact.id;

  useEffect(() => {
    let cancelled = false;
    setComments(null);
    fetch(`/api/comments?contactId=${contactId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setComments(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setComments([]);
      });
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  // Remember the commenter's name between comments — it's almost always the same person.
  useEffect(() => {
    setAuthor(window.localStorage.getItem('nexis_author') ?? '');
  }, []);

  const addComment = useCallback(async () => {
    const text = body.trim();
    if (!text) return;
    setPosting(true);
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId, author: author.trim(), body: text }),
      });
      if (res.ok) {
        const created: Comment = await res.json();
        setComments((prev) => [created, ...(prev ?? [])]);
        setBody('');
        window.localStorage.setItem('nexis_author', author.trim());
        onCommentCountChange(contactId, 1);
      }
    } finally {
      setPosting(false);
    }
  }, [author, body, contactId, onCommentCountChange]);

  async function deleteComment(id: number) {
    setComments((prev) => (prev ?? []).filter((c) => c.id !== id));
    onCommentCountChange(contactId, -1);
    await fetch(`/api/comments/${id}`, { method: 'DELETE' });
  }

  return (
    <>
      <div className="overlay" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="Contact details">
        <div className="drawer-head">
          <h2>{contact.contact_name || contact.school || `Contact #${contact.id}`}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="drawer-body">
          {ALL_COLUMNS.map(({ key, label }) => (
            <div className="field" key={key}>
              <label htmlFor={`f-${key}`}>{label}</label>
              <EditableCell
                className=""
                value={contact[key] ?? ''}
                onCommit={(next) => onPatch(contact.id, { [key]: next })}
              />
            </div>
          ))}

          <div className="field">
            <label htmlFor="f-notes">Notes</label>
            <textarea
              id="f-notes"
              rows={5}
              defaultValue={contact.notes ?? ''}
              key={`notes-${contact.id}`}
              onBlur={(e) => {
                if (e.target.value !== (contact.notes ?? '')) {
                  onPatch(contact.id, { notes: e.target.value });
                }
              }}
            />
          </div>

          {fields.length > 0 && (
            <>
              <div className="section-title">Custom fields</div>
              {fields.map((field) => (
                <div className="field" key={field.key}>
                  <label>{field.label}</label>
                  <EditableCell
                    className=""
                    value={contact.custom?.[field.key] ?? ''}
                    onCommit={(next) =>
                      onPatch(contact.id, { custom: { [field.key]: next } })
                    }
                  />
                </div>
              ))}
            </>
          )}

          <div className="section-title">
            Comments {comments ? `(${comments.length})` : ''}
          </div>

          <div className="field">
            <input
              placeholder="Your name"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
            />
          </div>
          <div className="field">
            <textarea
              rows={3}
              placeholder="Add a comment…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addComment();
              }}
            />
          </div>
          <button
            className="btn btn-accent"
            onClick={addComment}
            disabled={posting || !body.trim()}
          >
            {posting ? 'Posting…' : 'Add comment'}
          </button>

          <div style={{ marginTop: 16 }}>
            {comments === null && <div className="meta-line">Loading comments…</div>}
            {comments?.length === 0 && <div className="meta-line">No comments yet.</div>}
            {comments?.map((c) => (
              <div className="comment" key={c.id}>
                <div className="comment-meta">
                  <strong>{c.author || 'Anonymous'}</strong>
                  <span>{formatDate(c.created_at)}</span>
                  <button
                    className="del"
                    onClick={() => deleteComment(c.id)}
                    aria-label="Delete comment"
                  >
                    ✕
                  </button>
                </div>
                <div className="comment-body">{c.body}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="drawer-foot">
          <span className="meta-line">Updated {formatDate(contact.updated_at)}</span>
          <button
            className="btn btn-danger"
            onClick={() => {
              if (confirm('Delete this contact and all its comments?')) onDelete(contact.id);
            }}
          >
            Delete contact
          </button>
        </div>
      </aside>
    </>
  );
}
