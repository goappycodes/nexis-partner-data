'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Text input that only reports a change when the user leaves the cell (or hits
 * Enter). It keeps its own draft while focused so a background refresh of the
 * row can't overwrite what is being typed.
 */
export default function EditableCell({
  value,
  onCommit,
  className = 'cell-input',
  placeholder,
}: {
  value: string;
  onCommit: (next: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) setDraft(value);
  }, [value]);

  function commit() {
    if (draft !== value) onCommit(draft);
  }

  return (
    <input
      ref={inputRef}
      className={className}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          setDraft(value);
          // Let the reset land before removing focus so blur sees the old value.
          requestAnimationFrame(() => inputRef.current?.blur());
        }
      }}
    />
  );
}
