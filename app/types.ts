export type Contact = {
  id: number;
  school: string;
  location: string;
  contact_name: string;
  role: string;
  phone: string;
  email: string;
  nexis_poc: string;
  status: string;
  notes: string;
  source: string;
  custom: Record<string, string>;
  created_at: string;
  updated_at: string;
};

export type CustomField = { id: number; key: string; label: string; position: number };

export type Comment = {
  id: number;
  contact_id: number;
  author: string;
  body: string;
  created_at: string;
};

/** Columns shown in the grid, in order. Notes and Source live in the drawer. */
export const GRID_COLUMNS = [
  { key: 'school', label: 'School' },
  { key: 'location', label: 'Location' },
  { key: 'contact_name', label: 'Contact' },
  { key: 'role', label: 'Role' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'nexis_poc', label: 'POC' },
  { key: 'status', label: 'Status' },
] as const;

/** Every built-in text column, used by the drawer form. */
export const ALL_COLUMNS = [
  ...GRID_COLUMNS,
  { key: 'source', label: 'Source' },
] as const;

export type ColumnKey = (typeof ALL_COLUMNS)[number]['key'];
