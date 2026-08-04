const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'All_School_Contacts.csv');

// --- CSV parser (RFC4180-ish, handles quoted multi-line fields) ---
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      } else { field += c; i++; continue; }
    } else {
      if (c === '"') { inQuotes = true; i++; continue; }
      if (c === ',') { row.push(field); field = ''; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
      field += c; i++; continue;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function clean(s) {
  if (s === undefined || s === null) return '';
  return String(s).replace(/\s+/g, ' ').trim();
}

const contacts = [];

function addContact(c) {
  // must have at least a name, phone, or email to be worth keeping
  if (!clean(c.ContactName) && !clean(c.Phone) && !clean(c.Email)) return;
  contacts.push({
    School: clean(c.School),
    Location: clean(c.Location),
    ContactName: clean(c.ContactName),
    Role: clean(c.Role),
    Phone: clean(c.Phone),
    Email: clean(c.Email),
    NexisPOC: clean(c.NexisPOC),
    Status: clean(c.Status),
    Notes: clean(c.Notes),
    Source: clean(c.Source),
  });
}

const ROLE_WORDS = [
  'principal', 'headmaster', 'headmistress', 'bursar', 'director', 'owner',
  'coordinator', 'cordinator', 'teacher', 'rector', 'prefect', 'sister', 'father',
  'administrator', 'admin', 'reception', 'office', 'vice principal', 'vp',
  'hod', 'incharge', 'in-charge', 'academics', 'secretary', 'senior teacher'
];

function splitNameRole(text) {
  // text like "Neil monteiro principal" or "Jena ma'am headmistress"
  let t = clean(text).replace(/^[-,/]+|[-,/]+$/g, '').trim();
  if (!t) return { name: '', role: '' };
  const lower = t.toLowerCase();
  for (const rw of ROLE_WORDS) {
    const idx = lower.indexOf(rw);
    if (idx > 0) {
      const name = t.slice(0, idx).trim().replace(/[-–,]+$/, '').trim();
      const role = t.slice(idx).trim();
      if (name) return { name, role };
    }
  }
  return { name: t, role: '' };
}

// extract [{name, role, phone}] from a blob like:
// "Neil monteiro principal - 7431037852/ Jena ma'am headmistress 9434075082"
function extractPeople(blob) {
  const out = [];
  if (!clean(blob)) return out;
  const segments = blob.split(/[\/,\n]/);
  for (let seg of segments) {
    seg = clean(seg);
    if (!seg) continue;
    // find a phone number pattern within the segment
    const phoneMatch = seg.match(/(\+?\d[\d\s-]{7,14}\d)/);
    let phone = '';
    let rest = seg;
    if (phoneMatch) {
      phone = phoneMatch[0].replace(/\s+/g, '');
      rest = (seg.slice(0, phoneMatch.index) + ' ' + seg.slice(phoneMatch.index + phoneMatch[0].length)).trim();
    }
    rest = rest.replace(/^[-,/]+|[-,/]+$/g, '').trim();
    const { name, role } = splitNameRole(rest);
    if (name || phone) out.push({ name, role, phone });
  }
  return out;
}

function extractEmails(blob) {
  if (!clean(blob)) return [];
  return clean(blob).split('/').map(e => clean(e)).filter(Boolean);
}

// Some sheets have POC names typed into the "email" column by mistake.
// Split into real emails (contain @) vs leftover text (fallback POC/notes).
function splitEmailBlob(blob) {
  if (!clean(blob)) return { emails: [], extra: [] };
  const parts = clean(blob).split('/').map(clean).filter(Boolean);
  const emails = parts.filter(p => p.includes('@'));
  const extra = parts.filter(p => !p.includes('@'));
  return { emails, extra };
}

// ============ FILE 1: Admission strategy 2026 - School workshops Hills, Siliguri ============
function processFile1() {
  const file = path.join(ROOT, 'Admission strategy 2026 - School workshops Hills_ Siliguri.csv');
  const text = fs.readFileSync(file, 'utf8');
  const rows = parseCSV(text).filter(r => r.some(c => clean(c) !== ''));
  rows.shift(); // header (also happens to be the "Kalimpong" section label)
  let region = 'Kalimpong';
  const REGION_NAMES = new Set([
    'kalimpong', 'darjeeling', 'kurseong', 'mirik', 'gangtok', 'doars', 'sukna',
    'matigara / uttorayon / medical side', 'sevoke road / salugara',
    'champasari / kolabari', 'ranidanga / bagdogra side/ fulbari', 'thana more', 'purnea',
    'dagapur / dhukuria / new chumta',
  ]);
  for (const r of rows) {
    const school = clean(r[0]);
    const contactBlob = r[1] || ''; // keep raw (newlines intact) for extractPeople
    const emailBlob = clean(r[2]);
    const poc = clean(r[3]);
    const notesParts = [r[4], r[6]].map(clean).filter(Boolean);
    const notes = notesParts.join(' | ');
    if (!school) continue;
    // Region header rows carry a known region name with no contact details.
    // Only the contact columns need to be empty — the "DAGAPUR / DHUKURIA / NEW
    // CHUMTA" header also carries a name in a later planning column, and
    // requiring every column to be blank made the Siliguri schools under it
    // inherit the previous region ("Doars").
    const noContactDetails = !clean(contactBlob) && !emailBlob && !poc;
    if (noContactDetails && REGION_NAMES.has(school.toLowerCase())) {
      region = school;
      continue;
    }
    const people = extractPeople(contactBlob);
    const { emails, extra } = splitEmailBlob(emailBlob);
    const emailStr = emails.join('; ');
    // In the Siliguri sub-table, the POC column often holds status text
    // ("Reached out", "Direct visit done") while the POC name landed in
    // the email column instead. Detect and swap.
    const STATUS_LIKE = /reached out|direct visit|direct school visit|not going|msg dropped|^msg$|yet to|no response|\bdnr\b|switched off/i;
    let finalPoc, status;
    if (STATUS_LIKE.test(poc)) {
      status = poc;
      finalPoc = extra.join('/');
    } else {
      status = '';
      finalPoc = poc || extra.join('/');
    }
    if (people.length === 0) {
      addContact({
        School: school, Location: region, ContactName: '', Role: '',
        Phone: '', Email: emailStr, NexisPOC: finalPoc, Status: status, Notes: notes,
        Source: 'School workshops (Hills & Siliguri)'
      });
    } else {
      for (const p of people) {
        addContact({
          School: school, Location: region, ContactName: p.name, Role: p.role,
          Phone: p.phone, Email: emailStr, NexisPOC: finalPoc, Status: status, Notes: notes,
          Source: 'School workshops (Hills & Siliguri)'
        });
      }
    }
  }
}

// ============ FILE 2: Admission strategy 2026 - Udaan ============
function processFile2() {
  const file = path.join(ROOT, 'Admission strategy 2026 - Udaan.csv');
  const text = fs.readFileSync(file, 'utf8');
  const rows = parseCSV(text).filter(r => r.some(c => clean(c) !== ''));
  rows.shift(); // header
  for (const r of rows) {
    const school = clean(r[0]);
    if (!school) continue;
    const status = clean(r[1]);
    const poc = clean(r[2]);
    const primaryRole = clean(r[3]);
    const primaryName = clean(r[4]);
    const primaryPhone = clean(r[5]);
    const principalName = clean(r[6]);
    const principalPhone = clean(r[7]);
    const notes = clean(r[8]);
    const seniorTeacherName = clean(r[9]);
    const seniorTeacherPhone = clean(r[10]);
    const followUp = clean(r[11]);
    const email = clean(r[12]);
    const combinedNotes = [notes, followUp ? `Follow-up: ${followUp}` : ''].filter(Boolean).join(' | ');

    let any = false;
    if (primaryName || primaryPhone) {
      any = true;
      addContact({
        School: school, Location: 'Siliguri', ContactName: primaryName, Role: primaryRole || 'Primary Contact',
        Phone: primaryPhone, Email: email, NexisPOC: poc, Status: status, Notes: combinedNotes,
        Source: 'Admission strategy - Udaan'
      });
    }
    if (principalName || principalPhone) {
      any = true;
      addContact({
        School: school, Location: 'Siliguri', ContactName: principalName, Role: 'Principal',
        Phone: principalPhone, Email: email, NexisPOC: poc, Status: status, Notes: combinedNotes,
        Source: 'Admission strategy - Udaan'
      });
    }
    if (seniorTeacherName || seniorTeacherPhone) {
      any = true;
      addContact({
        School: school, Location: 'Siliguri', ContactName: seniorTeacherName, Role: 'Senior Teacher',
        Phone: seniorTeacherPhone, Email: email, NexisPOC: poc, Status: status, Notes: combinedNotes,
        Source: 'Admission strategy - Udaan'
      });
    }
    if (!any) {
      addContact({
        School: school, Location: 'Siliguri', ContactName: '', Role: '',
        Phone: '', Email: email, NexisPOC: poc, Status: status, Notes: combinedNotes,
        Source: 'Admission strategy - Udaan'
      });
    }
  }
}

// ============ FILE 3: ISBF Event - School Follow-up Plan ============
function processFile3() {
  const file = path.join(ROOT, 'ISBF Event - School Follow-up Plan.csv');
  const text = fs.readFileSync(file, 'utf8');
  const rows = parseCSV(text).filter(r => r.some(c => clean(c) !== ''));
  rows.shift(); // header
  for (const r of rows) {
    const school = clean(r[0]);
    if (!school) continue;
    const email = clean(r[1]);
    const contactBlob = r[2] || ''; // keep raw (newlines intact) for extractPeople
    const status = clean(r[9]) || clean(r[11]);
    const notesParts = [r[4], r[3] ? `Physical meet up: ${clean(r[3])}` : ''].map(clean).filter(Boolean);
    const notes = notesParts.join(' | ');
    const people = extractPeople(contactBlob);
    if (people.length === 0) {
      addContact({
        School: school, Location: 'Siliguri', ContactName: '', Role: '',
        Phone: '', Email: email, NexisPOC: '', Status: status, Notes: notes,
        Source: 'ISBF Event - School Follow-up Plan'
      });
    } else {
      for (const p of people) {
        addContact({
          School: school, Location: 'Siliguri', ContactName: p.name, Role: p.role,
          Phone: p.phone, Email: email, NexisPOC: '', Status: status, Notes: notes,
          Source: 'ISBF Event - School Follow-up Plan'
        });
      }
    }
  }
}

// ============ FILE 4: Teachers - MASTER DATA ============
function processFile4() {
  const file = path.join(ROOT, 'Teachers - MASTER DATA.csv');
  const text = fs.readFileSync(file, 'utf8');
  const rows = parseCSV(text).filter(r => r.some(c => clean(c) !== ''));
  rows.shift(); // header
  const REGION_HEADERS = new Set(['jalpaiguri and dooars', 'hills', 'sikkim']);
  for (const r of rows) {
    const c0 = clean(r[0]);
    const c1 = clean(r[1]);
    const c2 = clean(r[2]);
    const c3 = clean(r[3]);
    const c4 = clean(r[4]);
    const c5 = clean(r[5]);
    if (!c0 && !c1 && !c2 && !c4 && !c5) continue;
    if (REGION_HEADERS.has(c0.toLowerCase()) && !c1 && !c2) continue; // section header row

    if (c1 === "Sir / Ma'am") {
      // standard format: Name, Salutation, Phone, Length, School, Location
      addContact({
        School: c4, Location: c5, ContactName: c0, Role: '',
        Phone: c2, Email: '', NexisPOC: '', Status: '', Notes: '',
        Source: 'Teachers - Master Data'
      });
    } else {
      // alt format seen at bottom of sheet: col0=referrer/misc, col1=Name, col2=Phone, col3=School/Notes
      const name = c1 || c0;
      const notes = c1 ? (c0 ? `Referred via/with: ${c0}` : '') : '';
      addContact({
        School: c3, Location: '', ContactName: name, Role: '',
        Phone: c2, Email: '', NexisPOC: '', Status: '', Notes: notes,
        Source: 'Teachers - Master Data'
      });
    }
  }
}

processFile1();
processFile2();
processFile3();
processFile4();

// ============ normalise ============

/**
 * Phone numbers arrive as bare 10-digit mobiles, 91-prefixed, 0-prefixed
 * landlines with an STD code, and a couple of Nepal numbers. Everything that
 * can be identified confidently becomes E.164; anything else is left untouched
 * and reported, rather than guessed at.
 */
function normalizePhone(raw) {
  const trimmed = clean(raw);
  if (!trimmed) return '';
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';

  if (digits.startsWith('977') && (digits.length === 12 || digits.length === 13)) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+91${digits.slice(2)}`;
  if (digits.length === 13 && digits.startsWith('910')) return `+91${digits.slice(3)}`;
  return trimmed;
}

// Route names used to plan school visits around Siliguri. They are areas of
// Siliguri, not separate towns, so they collapse into it and the specific area
// is kept as a note.
const SILIGURI_AREAS = new Set([
  'dagapur / dhukuria / new chumta', 'sukna', 'matigara / uttorayon / medical side',
  'sevoke road / salugara', 'champasari / kolabari',
  'ranidanga / bagdogra side/ fulbari', 'thana more',
]);

// Spelling variants of the same place, which otherwise show up as separate
// entries in the location filter.
const LOCATION_CANON = {
  'oodlabari': 'Oodlabari', 'odlabari': 'Oodlabari',
  'birpara': 'Birpara', 'birapara': 'Birpara',
  'jaigoan': 'Jaigaon', 'kisanganj': 'Kishanganj',
  'doars': 'Dooars', 'purnea': 'Purnea',
};

function normalizeLocation(raw) {
  const value = clean(raw);
  if (!value) return { location: '', area: '' };
  const lower = value.toLowerCase();
  if (SILIGURI_AREAS.has(lower)) return { location: 'Siliguri', area: value };
  return { location: LOCATION_CANON[lower] ?? value, area: '' };
}

/**
 * A few cells hold two numbers run together. Where the digits divide evenly
 * into whole mobile numbers, the first becomes the contact's number and the
 * rest are kept as a note instead of being dropped.
 */
function normalizePhoneField(raw) {
  const direct = normalizePhone(raw);
  if (!direct || direct.startsWith('+')) return { phone: direct, extras: [] };

  const digits = clean(raw).replace(/\D/g, '');
  if (digits.length >= 20 && digits.length % 10 === 0) {
    const parts = [];
    for (let i = 0; i < digits.length; i += 10) parts.push(`+91${digits.slice(i, i + 10)}`);
    return { phone: parts[0], extras: parts.slice(1) };
  }
  return { phone: direct, extras: [] };
}

for (const c of contacts) {
  const { phone, extras } = normalizePhoneField(c.Phone);
  c.Phone = phone;
  const { location, area } = normalizeLocation(c.Location);
  c.Location = location;
  const additions = [];
  if (area) additions.push(`Area: ${area}`);
  if (extras.length) additions.push(`Other numbers: ${extras.join(', ')}`);
  if (additions.length) c.Notes = [c.Notes, ...additions].filter(Boolean).join(' | ');
}

// ============ merge duplicates ============

const HONORIFICS = /\b(sir|ma'?ams?|madam|mam|mr|mrs|ms|miss|dr|fr|sr|father|sister|rev|uncle|aunty|ji)\b\.?/gi;

/** Letters in a name once honorifics are stripped — "Priyanka Bose" beats "Priyanka ma'am". */
function nameScore(name) {
  return name.replace(HONORIFICS, '').replace(/[^a-z]/gi, '').length;
}

function normKey(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Union-find, so a row linked by phone to one record and by name+school to
// another ends up in a single group.
const parent = contacts.map((_, i) => i);
function find(i) {
  while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
  return i;
}
function union(a, b) {
  const ra = find(a), rb = find(b);
  if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
}

const byPhone = new Map();
const byNameSchool = new Map();
contacts.forEach((c, i) => {
  // Only link on numbers we were able to normalise — a partial number like
  // "270037" is not a reliable identity.
  if (c.Phone.startsWith('+')) {
    const key = c.Phone;
    if (byPhone.has(key)) union(byPhone.get(key), i);
    else byPhone.set(key, i);
  }
  const nameKey = normKey(c.ContactName);
  const schoolKey = normKey(c.School);
  if (nameKey && schoolKey) {
    const key = `${nameKey}@${schoolKey}`;
    if (byNameSchool.has(key)) union(byNameSchool.get(key), i);
    else byNameSchool.set(key, i);
  }
});

// A third pass for rows that carry no phone, where the same person was written
// down slightly differently ("Priyanka Bose" at Mahbert vs "Priyanka Maam" at
// Mahbert Siliguri). Matching is deliberately narrow: same first name, and one
// school name a prefix of the other once generic words are dropped.
const SCHOOL_STOP = new Set([
  'school', 'schools', 'high', 'higher', 'secondary', 'public', 'academy',
  'international', 'convent', 'residential', 'the', 'and', 'of', 'sr', 'jr',
  'st', 'saint', 'dr', 'mission', 'memorial', 'group', 'institute', 'english',
  'college', 'cbse',
]);

function schoolCore(name) {
  return clean(name).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
    .filter((w) => w && !SCHOOL_STOP.has(w)).join('');
}

function nameTokens(name) {
  return clean(name).toLowerCase().replace(HONORIFICS, '')
    .replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean);
}

function firstName(name) {
  return nameTokens(name)[0] ?? '';
}

/**
 * Two full names sharing a first name but ending in different surnames are two
 * people, not one record written twice — "Ashish Sharma" and "Ashish Khatiwoda"
 * both teach at Narayana. A name with no surname ("Ganesh Sir") is treated as
 * compatible with anything, since it carries no evidence either way.
 */
function surnamesConflict(a, b) {
  const ta = nameTokens(a), tb = nameTokens(b);
  if (ta.length < 2 || tb.length < 2) return false;
  return ta[ta.length - 1] !== tb[tb.length - 1];
}

// Phones already known for each group, so a fuzzy link can never pull two
// people with different numbers together.
const groupPhones = new Map();
contacts.forEach((c, i) => {
  const root = find(i);
  if (!groupPhones.has(root)) groupPhones.set(root, new Set());
  if (c.Phone.startsWith('+')) groupPhones.get(root).add(c.Phone);
});

const byFirstName = new Map();
contacts.forEach((c, i) => {
  const fn = firstName(c.ContactName);
  const core = schoolCore(c.School);
  if (!fn || !core) return;
  if (!byFirstName.has(fn)) byFirstName.set(fn, []);
  byFirstName.get(fn).push(i);
});

const fuzzyMerges = [];
for (const indices of byFirstName.values()) {
  for (let a = 0; a < indices.length; a++) {
    for (let b = a + 1; b < indices.length; b++) {
      const i = indices[a], j = indices[b];
      const ri = find(i), rj = find(j);
      if (ri === rj) continue;

      const ci = schoolCore(contacts[i].School);
      const cj = schoolCore(contacts[j].School);
      if (!ci.startsWith(cj) && !cj.startsWith(ci)) continue;
      if (surnamesConflict(contacts[i].ContactName, contacts[j].ContactName)) continue;

      const phones = new Set([...(groupPhones.get(ri) ?? []), ...(groupPhones.get(rj) ?? [])]);
      if (phones.size > 1) continue; // different known numbers — leave them alone

      fuzzyMerges.push(
        `${contacts[i].ContactName} @ ${contacts[i].School}  +  ${contacts[j].ContactName} @ ${contacts[j].School}`
      );
      union(i, j);
      const root = find(i);
      groupPhones.set(root, phones);
    }
  }
}

const groups = new Map();
contacts.forEach((_, i) => {
  const root = find(i);
  if (!groups.has(root)) groups.set(root, []);
  groups.get(root).push(i);
});

/** Most frequent value wins; ties break on `score`, then on length. */
function pickBest(values, score = (v) => v.length) {
  const present = values.map(clean).filter(Boolean);
  if (present.length === 0) return '';
  const counts = new Map();
  for (const v of present) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) =>
    b[1] - a[1] || score(b[0]) - score(a[0]) || b[0].length - a[0].length
  )[0][0];
}

/**
 * Every distinct value, in first-seen order. `splitOn` is for fields that
 * already pack several values into one string (emails, POC initials); without
 * it each row's value is kept whole, so names and notes stay intact.
 */
function distinct(values, splitOn = null) {
  const seen = new Set();
  const out = [];
  for (const raw of values) {
    const parts = splitOn ? String(raw ?? '').split(splitOn) : [String(raw ?? '')];
    for (const part of parts) {
      const v = clean(part);
      if (v && !seen.has(v.toLowerCase())) { seen.add(v.toLowerCase()); out.push(v); }
    }
  }
  return out;
}

const merged = [];
let mergedAway = 0;
for (const indices of groups.values()) {
  const rows = indices.map((i) => contacts[i]);
  if (rows.length === 1) { merged.push(rows[0]); continue; }
  mergedAway += rows.length - 1;

  const name = pickBest(rows.map((r) => r.ContactName), nameScore);
  const school = pickBest(rows.map((r) => r.School));
  const phone = pickBest(rows.map((r) => r.Phone));

  // Names, schools and phones that lost the vote are kept as a note so the
  // merge never silently drops something a caller might recognise.
  const alsoNames = distinct(rows.map((r) => r.ContactName)).filter((v) => v !== name);
  const alsoSchools = distinct(rows.map((r) => r.School)).filter((v) => v !== school);
  const alsoPhones = distinct(rows.map((r) => r.Phone)).filter((v) => v !== phone);

  const notes = distinct(rows.map((r) => r.Notes));
  if (alsoNames.length) notes.push(`Also listed as: ${alsoNames.join(', ')}`);
  if (alsoSchools.length) notes.push(`Also under: ${alsoSchools.join(', ')}`);
  if (alsoPhones.length) notes.push(`Other numbers: ${alsoPhones.join(', ')}`);

  merged.push({
    School: school,
    Location: pickBest(rows.map((r) => r.Location)),
    ContactName: name,
    Role: pickBest(rows.map((r) => r.Role)),
    Phone: phone,
    Email: distinct(rows.map((r) => r.Email), /[;/]/).join('; '),
    NexisPOC: distinct(rows.map((r) => r.NexisPOC), /[;/]/).join('; '),
    Status: distinct(rows.map((r) => r.Status)).join(' | '),
    Notes: notes.join(' | '),
    Source: distinct(rows.map((r) => r.Source), /[;/]/).join('; '),
  });
}

const unnormalized = merged.filter((c) => c.Phone && !c.Phone.startsWith('+'));
contacts.length = 0;
contacts.push(...merged);
contacts.sort((a, b) =>
  a.School.localeCompare(b.School) || a.ContactName.localeCompare(b.ContactName)
);

// --- write output CSV ---
function csvEscape(v) {
  v = v === undefined || v === null ? '' : String(v);
  if (/[",\n]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
  return v;
}

const headers = ['School', 'Location', 'ContactName', 'Role', 'Phone', 'Email', 'NexisPOC', 'Status', 'Notes', 'Source'];
const lines = [headers.join(',')];
for (const c of contacts) {
  lines.push(headers.map(h => csvEscape(c[h])).join(','));
}
fs.writeFileSync(OUT, lines.join('\r\n'), 'utf8');

console.log(`Wrote ${contacts.length} contact rows to ${OUT}`);
console.log(`Merged ${mergedAway} duplicate rows away`);
if (fuzzyMerges.length) {
  console.log(`\n${fuzzyMerges.length} merged on name + school rather than a shared number:`);
  for (const m of fuzzyMerges) console.log(`  ${m}`);
}
if (unnormalized.length) {
  console.log(`\n${unnormalized.length} phone value(s) could not be normalised — review by hand:`);
  for (const c of unnormalized) {
    console.log(`  ${c.Phone}  (${c.ContactName || '—'} @ ${c.School || '—'})`);
  }
}
