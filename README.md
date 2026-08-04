# Nexis Partner Data

School and teacher contacts from four spreadsheets, consolidated into one Supabase
table with a password-protected web app for viewing, editing and commenting.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run db:setup             # create tables (safe to re-run)
npm run db:seed              # load All_School_Contacts.csv
npm run dev                  # http://localhost:3000
```

Sign in with the value of `APP_PASSWORD`.

## The data

`All_School_Contacts.csv` holds 401 contacts merged from:

| Source file | What it contributed |
| --- | --- |
| `Admission strategy 2026 - School workshops Hills_ Siliguri.csv` | Hills + Siliguri schools, grouped by region |
| `Admission strategy 2026 - Udaan.csv` | Nomination tracking, principal / director / senior teacher per school |
| `ISBF Event - School Follow-up Plan.csv` | Event follow-up call logs |
| `Teachers - MASTER DATA.csv` | Individual teacher phone book |

The originals stored several people per cell (`"Name role - phone/ Name2 - phone2"`,
sometimes split across newlines). The consolidation splits those into one row per
person and keeps the school, email and call notes attached to each. `Source` records
which sheet a row came from.

## App

- **Grid** — every contact, one row each. Click any cell to edit; it saves on blur
  or Enter, `Esc` cancels. Click a column header to sort.
- **Search and filters** — free-text search covers every field including notes;
  dropdowns narrow by location, source, and whether a phone number is missing.
- **Campaigns** — pick a campaign (or create one) from the tinted dropdown and
  three extra columns appear: outreach status, POC and notes, recorded against
  that campaign only. The same contact can be tracked separately across as many
  campaigns as you like; switching campaign swaps the values, and choosing
  "No campaign" hides the columns.
- **Detail drawer** — the `›` button opens a row for full editing, including the
  long `Notes` field, plus its comment thread. The badge on `›` counts comments.
- **Comments** — threaded per contact, with an author name remembered between posts.
- **Custom fields** — `+ Field` adds a new column for everyone. Values live in
  `contacts.custom` (jsonb). Double-click a custom column header to remove it;
  the stored values survive and reappear if you add the field back.

## Schema

| Table | Purpose |
| --- | --- |
| `contacts` | One row per person. Fixed text columns plus a `custom` jsonb bag. |
| `custom_fields` | Definitions for user-added columns (`key`, `label`, `position`). |
| `comments` | Free-text notes against a contact, cascade-deleted with it. |
| `campaigns` | An outreach round, e.g. "School workshops 2027". |
| `campaign_contacts` | One contact's status/POC/notes within one campaign, unique on the pair. Rows are created on first write, so untouched contacts cost nothing. |

RLS is enabled on all of them with **no policies**, so the anon key can read and
write nothing. The app reaches the database only from server-side route handlers using the
service role key, gated by the session cookie.

## Auth

One shared password (`APP_PASSWORD`). A successful login sets an httpOnly cookie
holding an HMAC of the password keyed by `SESSION_SECRET`; `middleware.ts` checks it
on every route except `/login`. There is no user table and no session store.

To change the password, update `APP_PASSWORD` and restart — existing cookies stop
validating automatically.

## Deploying

Any Node host works. On Vercel, import the repo and set `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `APP_PASSWORD` and `SESSION_SECRET` as environment
variables. `SUPABASE_DB_PASSWORD` and `SUPABASE_PROJECT_REF` are only needed by the
`db:setup` / `db:seed` scripts, not by the running app.

## Re-generating the CSV

`scripts/build-contacts.js` re-derives `All_School_Contacts.csv` from the four
source spreadsheets:

```bash
node scripts/build-contacts.js
```
