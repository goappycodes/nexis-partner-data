// Creates the schema. Safe to re-run: everything is IF NOT EXISTS / OR REPLACE.
import { connect } from './db.mjs';

const SQL = `
create table if not exists contacts (
  id            bigint generated always as identity primary key,
  school        text not null default '',
  location      text not null default '',
  contact_name  text not null default '',
  role          text not null default '',
  phone         text not null default '',
  email         text not null default '',
  nexis_poc     text not null default '',
  status        text not null default '',
  notes         text not null default '',
  source        text not null default '',
  custom        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- User-defined extra columns. Values live in contacts.custom keyed by "key".
create table if not exists custom_fields (
  id         bigint generated always as identity primary key,
  key        text not null unique,
  label      text not null,
  position   int  not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists comments (
  id         bigint generated always as identity primary key,
  contact_id bigint not null references contacts(id) on delete cascade,
  author     text not null default '',
  body       text not null,
  created_at timestamptz not null default now()
);

-- An outreach round, e.g. "School workshops 2027".
create table if not exists campaigns (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  archived   boolean not null default false,
  created_at timestamptz not null default now()
);

-- One contact's state within one campaign. A row appears the first time
-- something is recorded, so an untouched contact costs nothing.
create table if not exists campaign_contacts (
  id          bigint generated always as identity primary key,
  campaign_id bigint not null references campaigns(id) on delete cascade,
  contact_id  bigint not null references contacts(id)  on delete cascade,
  status      text not null default '',
  poc         text not null default '',
  notes       text not null default '',
  updated_at  timestamptz not null default now(),
  unique (campaign_id, contact_id)
);

create index if not exists campaign_contacts_campaign_idx on campaign_contacts (campaign_id);

create index if not exists comments_contact_id_idx on comments (contact_id, created_at desc);
create index if not exists contacts_school_idx     on contacts (school);
create index if not exists contacts_source_idx     on contacts (source);
create index if not exists contacts_location_idx   on contacts (location);

create or replace function set_updated_at() returns trigger
  language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists contacts_set_updated_at on contacts;
create trigger contacts_set_updated_at
  before update on contacts
  for each row execute function set_updated_at();

drop trigger if exists campaign_contacts_set_updated_at on campaign_contacts;
create trigger campaign_contacts_set_updated_at
  before update on campaign_contacts
  for each row execute function set_updated_at();

-- RLS on with no policies: the anon key can read/write nothing. The app talks
-- to these tables only from the server using the service role key, which
-- bypasses RLS.
alter table contacts          enable row level security;
alter table custom_fields     enable row level security;
alter table comments          enable row level security;
alter table campaigns         enable row level security;
alter table campaign_contacts enable row level security;
`;

const client = await connect();
try {
  await client.query(SQL);
  const { rows } = await client.query(
    `select table_name, (select count(*) from information_schema.columns c
       where c.table_name = t.table_name and c.table_schema = 'public') as columns
     from information_schema.tables t
     where t.table_schema = 'public'
       and t.table_name in ('contacts','comments','custom_fields','campaigns','campaign_contacts')
     order by 1`
  );
  console.log('schema ready:');
  for (const r of rows) console.log(`  ${r.table_name} (${r.columns} columns)`);
} finally {
  await client.end();
}
