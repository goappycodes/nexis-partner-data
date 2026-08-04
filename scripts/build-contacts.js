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
    'champasari / kolabari', 'ranidanga / bagdogra side/ fulbari', 'thana more', 'purnea'
  ]);
  for (const r of rows) {
    const school = clean(r[0]);
    const contactBlob = r[1] || ''; // keep raw (newlines intact) for extractPeople
    const emailBlob = clean(r[2]);
    const poc = clean(r[3]);
    const notesParts = [r[4], r[6]].map(clean).filter(Boolean);
    const notes = notesParts.join(' | ');
    if (!school) continue;
    // detect region header rows: only col0 filled, rest empty, and it's a known region name
    const restEmpty = !clean(contactBlob) && !emailBlob && !poc && !clean(r[4]) && !clean(r[5]) && !clean(r[6]) && !clean(r[7]) && !clean(r[8]);
    if (restEmpty && REGION_NAMES.has(school.toLowerCase())) {
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
