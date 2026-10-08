import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, getSetting, setSetting } from './db.js';
import { hashPassword, verifyPassword, makeToken, readToken, parseCookies } from './auth.js';
import { checkLeave, annualDaysUsed, isIsoDate, iso, holidays, LEAVE_TYPES, SPECIAL_TYPES, DEPARTMENTS } from './rules.js';
import { sendMail } from './mail.js';
import { runNotifications, startNotifier } from './notifier.js';

const app = express();
app.use(express.json());
app.disable('x-powered-by');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (process.env.NODE_ENV === 'production' ? null : 'admin');
if (!ADMIN_PASSWORD) { console.error('Ορίστε ADMIN_PASSWORD.'); process.exit(1); }

const today = () => iso(new Date());
const activeEmployees = () => db.prepare('SELECT * FROM employees WHERE active = 1 ORDER BY department DESC, id').all();
const publicEmp = (e) => ({ id: e.id, name: e.name, department: e.department, annual_days: e.annual_days });
const liveLeaves = () => db.prepare("SELECT * FROM leaves WHERE status IN ('pending','approved')").all();
const blockedDays = () => db.prepare('SELECT * FROM blocked_days ORDER BY start').all();
const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => { console.error(e); res.status(500).json({ error: 'Σφάλμα διακομιστή.' }); });

// ---- Auth ----
app.get('/health', (_req, res) => res.send('ok'));
app.get('/api/login-options', (_req, res) => res.json(activeEmployees().map((e) => e.name)));

const attempts = new Map();
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const key = `${req.ip}|${username}`;
  const a = attempts.get(key) || { n: 0, until: 0 };
  if (a.until > Date.now()) return res.status(429).json({ error: 'Πολλές αποτυχημένες προσπάθειες. Δοκιμάστε σε λίγα λεπτά.' });
  let subject = null;
  if (username === 'admin') {
    if (password === ADMIN_PASSWORD) subject = 'admin';
  } else {
    const e = db.prepare('SELECT * FROM employees WHERE name = ? AND active = 1').get(String(username));
    if (e && verifyPassword(String(password), e.password_hash)) subject = String(e.id);
  }
  if (!subject) {
    a.n += 1; if (a.n >= 5) { a.until = Date.now() + 10 * 60000; a.n = 0; }
    attempts.set(key, a);
    return res.status(401).json({ error: 'Λάθος στοιχεία σύνδεσης.' });
  }
  attempts.delete(key);
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `session=${makeToken(subject)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200${secure}`);
  res.json({ ok: true });
});
app.post('/api/logout', (_req, res) => { res.setHeader('Set-Cookie', 'session=; HttpOnly; Path=/; Max-Age=0'); res.json({ ok: true }); });

app.use('/api', (req, res, next) => {
  const subject = readToken(parseCookies(req.headers.cookie).session);
  if (!subject) return res.status(401).json({ error: 'Απαιτείται σύνδεση.' });
  req.isAdmin = subject === 'admin';
  req.user = req.isAdmin ? null : db.prepare('SELECT * FROM employees WHERE id = ? AND active = 1').get(Number(subject));
  if (!req.isAdmin && !req.user) return res.status(401).json({ error: 'Απαιτείται σύνδεση.' });
  next();
});
const adminOnly = (req, res, next) => (req.isAdmin ? next() : res.status(403).json({ error: 'Μόνο για τον διαχειριστή.' }));

const year = () => Number(today().slice(0, 4));
function balanceOf(e, y = year()) {
  const mine = db.prepare("SELECT * FROM leaves WHERE employee_id = ? AND status IN ('pending','approved')").all(e.id);
  const used = annualDaysUsed(mine, y, ['approved']);
  const pending = annualDaysUsed(mine, y, ['pending']);
  return { employee_id: e.id, name: e.name, department: e.department, total: e.annual_days, used, pending, remaining: e.annual_days - used - pending, year: y };
}

app.get('/api/me', (req, res) => {
  res.json({
    role: req.isAdmin ? 'admin' : 'employee',
    user: req.user ? publicEmp(req.user) : { name: 'Διαχειριστής' },
    balance: req.user ? balanceOf(req.user) : null,
    types: LEAVE_TYPES, departments: DEPARTMENTS, specialTypes: SPECIAL_TYPES,
  });
});
app.post('/api/me/password', (req, res) => {
  if (req.isAdmin) return res.status(400).json({ error: 'Ο κωδικός admin ορίζεται από το ADMIN_PASSWORD.' });
  const { current, next } = req.body || {};
  if (!verifyPassword(String(current), req.user.password_hash)) return res.status(400).json({ error: 'Λάθος τρέχων κωδικός.' });
  if (String(next || '').length < 8) return res.status(400).json({ error: 'Ο νέος κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες.' });
  db.prepare('UPDATE employees SET password_hash = ? WHERE id = ?').run(hashPassword(next), req.user.id);
  res.json({ ok: true });
});

// ---- Ημερολόγιο (ορατό σε όλους) ----
app.get('/api/calendar', (req, res) => {
  const from = isIsoDate(req.query.from) ? req.query.from : `${year()}-01-01`;
  const to = isIsoDate(req.query.to) ? req.query.to : `${year()}-12-31`;
  const leaves = db.prepare(`
    SELECT l.id, l.employee_id, e.name, e.department, l.type, l.start, l.end, l.status
    FROM leaves l JOIN employees e ON e.id = l.employee_id
    WHERE l.status IN ('pending','approved') AND l.start <= ? AND l.end >= ? ORDER BY l.start`).all(to, from);
  const hol = [];
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) hol.push(...holidays(y));
  res.json({ leaves, blocked: blockedDays().filter((b) => b.start <= to && b.end >= from), holidays: hol, employees: activeEmployees().map(publicEmp) });
});

// ---- Αιτήσεις εργαζομένων ----
app.get('/api/leaves/mine', (req, res) => {
  if (req.isAdmin) return res.json([]);
  res.json(db.prepare('SELECT * FROM leaves WHERE employee_id = ? ORDER BY start DESC').all(req.user.id));
});

app.post('/api/leaves', wrap(async (req, res) => {
  if (req.isAdmin) return res.status(400).json({ error: 'Ο διαχειριστής καταχωρεί άδειες από τον πίνακα διαχείρισης.' });
  const { start, end, note } = req.body || {};
  const result = checkLeave({ start, end: end || start, type: 'annual' }, {
    emp: req.user, employees: activeEmployees(), leaves: liveLeaves(), blocked: blockedDays(), today: today(),
    enforceBalance: true, enforceDepartment: true, enforceBlocked: true, enforcePast: true,
  });
  if (!result.ok) return res.status(422).json({ error: result.errors.join(' '), errors: result.errors });
  const info = db.prepare("INSERT INTO leaves (employee_id, type, start, end, status, note, created_by) VALUES (?, 'annual', ?, ?, 'pending', ?, 'employee')")
    .run(req.user.id, start, end || start, String(note || '').slice(0, 500));
  const adminEmail = getSetting('admin_email', '');
  if (adminEmail) {
    sendMail({ to: adminEmail, subject: `Νέα αίτηση άδειας: ${req.user.name}`, text: `${req.user.name} ζητά κανονική άδεια ${start} – ${end || start} (${result.days.length} εργάσιμες).\n${note ? `Σημείωση: ${note}\n` : ''}\nΕγκρίνετε ή απορρίψτε από την εφαρμογή Adeies.` })
      .catch((e) => console.error('[mail]', e.message));
  }
  res.status(201).json({ id: Number(info.lastInsertRowid), days: result.days.length });
}));

app.post('/api/leaves/:id/cancel', (req, res) => {
  const l = db.prepare('SELECT * FROM leaves WHERE id = ?').get(Number(req.params.id));
  if (!l || (!req.isAdmin && l.employee_id !== req.user.id)) return res.status(404).json({ error: 'Δεν βρέθηκε.' });
  if (!req.isAdmin && (l.status !== 'pending' && !(l.status === 'approved' && l.start > today()))) return res.status(400).json({ error: 'Δεν μπορεί να ακυρωθεί.' });
  db.prepare('DELETE FROM leaves WHERE id = ?').run(l.id);
  res.json({ ok: true });
});

// ---- Admin ----
app.get('/api/admin/leaves', adminOnly, (req, res) => {
  const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : null;
  const rows = db.prepare(`SELECT l.*, e.name, e.department FROM leaves l JOIN employees e ON e.id = l.employee_id
    ${status ? 'WHERE l.status = ?' : ''} ORDER BY l.start DESC LIMIT 500`).all(...(status ? [status] : []));
  res.json(rows);
});

app.post('/api/admin/leaves/:id/approve', adminOnly, (req, res) => {
  const l = db.prepare('SELECT * FROM leaves WHERE id = ?').get(Number(req.params.id));
  if (!l || l.status !== 'pending') return res.status(404).json({ error: 'Η αίτηση δεν βρέθηκε ή δεν είναι εκκρεμής.' });
  const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(l.employee_id);
  // Επανέλεγχος κανόνων τη στιγμή της έγκρισης (εκτός της ίδιας της αίτησης). Ο admin μπορεί να παρακάμψει με force.
  const result = checkLeave(l, {
    emp, employees: activeEmployees(), leaves: liveLeaves(), blocked: blockedDays(), today: today(), ignoreLeaveId: l.id,
    enforceBalance: true, enforceDepartment: true, enforceBlocked: true, enforcePast: false,
  });
  if (!result.ok && !req.body?.force) return res.status(409).json({ error: result.errors.join(' '), errors: result.errors, canForce: true });
  db.prepare("UPDATE leaves SET status = 'approved', decision_note = ? WHERE id = ?").run(String(req.body?.note || '').slice(0, 500), l.id);
  res.json({ ok: true });
});
app.post('/api/admin/leaves/:id/reject', adminOnly, (req, res) => {
  const r = db.prepare("UPDATE leaves SET status = 'rejected', decision_note = ? WHERE id = ? AND status = 'pending'")
    .run(String(req.body?.note || '').slice(0, 500), Number(req.params.id));
  res.json({ ok: r.changes > 0 });
});

// Έκτακτες άδειες (αναρρωτική, ασθενείας κλπ.) — καταχωρούνται από τον admin, εγκρίνονται άμεσα, δεν μετρούν στο υπόλοιπο
app.post('/api/admin/leaves', adminOnly, (req, res) => {
  const { employee_id, type, start, end, note } = req.body || {};
  const emp = db.prepare('SELECT * FROM employees WHERE id = ? AND active = 1').get(Number(employee_id));
  if (!emp) return res.status(400).json({ error: 'Άγνωστος εργαζόμενος.' });
  if (!LEAVE_TYPES[type]) return res.status(400).json({ error: 'Άγνωστος τύπος άδειας.' });
  const asRegular = type === 'annual';
  const result = checkLeave({ start, end: end || start, type }, {
    emp, employees: activeEmployees(), leaves: liveLeaves(), blocked: blockedDays(), today: today(),
    enforceBalance: asRegular, enforceDepartment: asRegular && !req.body.force, enforceBlocked: false, enforcePast: false,
  });
  if (!result.ok) return res.status(422).json({ error: result.errors.join(' '), errors: result.errors });
  const info = db.prepare("INSERT INTO leaves (employee_id, type, start, end, status, note, created_by) VALUES (?, ?, ?, ?, 'approved', ?, 'admin')")
    .run(emp.id, type, start, end || start, String(note || '').slice(0, 500));
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

app.get('/api/admin/balances', adminOnly, (_req, res) => res.json(activeEmployees().map((e) => balanceOf(e))));
app.patch('/api/admin/employees/:id', adminOnly, (req, res) => {
  const days = Number(req.body?.annual_days);
  if (!Number.isInteger(days) || days < 0 || days > 100) return res.status(400).json({ error: 'Μη έγκυρος αριθμός ημερών.' });
  db.prepare('UPDATE employees SET annual_days = ? WHERE id = ?').run(days, Number(req.params.id));
  res.json({ ok: true });
});
app.post('/api/admin/employees/:id/reset-password', adminOnly, (req, res) => {
  const pw = String(req.body?.password || '');
  if (pw.length < 8) return res.status(400).json({ error: 'Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες.' });
  db.prepare('UPDATE employees SET password_hash = ? WHERE id = ?').run(hashPassword(pw), Number(req.params.id));
  res.json({ ok: true });
});

app.post('/api/admin/blocked', adminOnly, (req, res) => {
  const { start, end, reason } = req.body || {};
  if (!isIsoDate(start) || !isIsoDate(end || start) || (end || start) < start) return res.status(400).json({ error: 'Μη έγκυρες ημερομηνίες.' });
  const info = db.prepare('INSERT INTO blocked_days (start, end, reason) VALUES (?, ?, ?)').run(start, end || start, String(reason || '').slice(0, 200));
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});
app.delete('/api/admin/blocked/:id', adminOnly, (req, res) => { db.prepare('DELETE FROM blocked_days WHERE id = ?').run(Number(req.params.id)); res.json({ ok: true }); });

app.get('/api/admin/settings', adminOnly, (_req, res) => res.json({ admin_email: getSetting('admin_email', ''), notify_days: getSetting('notify_days', '7,2'), smtp_configured: Boolean(process.env.SMTP_HOST) }));
app.put('/api/admin/settings', adminOnly, (req, res) => {
  const { admin_email, notify_days } = req.body || {};
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(admin_email))) return res.status(400).json({ error: 'Μη έγκυρο email.' });
  const days = String(notify_days).split(',').map((n) => Number(n.trim()));
  if (!days.length || days.some((n) => !Number.isInteger(n) || n < 1 || n > 90)) return res.status(400).json({ error: 'Οι ημέρες ειδοποίησης πρέπει να είναι ακέραιοι 1–90, χωρισμένοι με κόμμα.' });
  setSetting('admin_email', admin_email); setSetting('notify_days', days.join(','));
  res.json({ ok: true });
});
app.post('/api/admin/test-email', adminOnly, wrap(async (_req, res) => {
  const r = await sendMail({ to: getSetting('admin_email', ''), subject: 'Adeies — δοκιμαστικό email', text: 'Οι ειδοποιήσεις email λειτουργούν.' });
  res.json(r);
}));
app.post('/api/admin/run-notifications', adminOnly, wrap(async (_req, res) => res.json({ sent: await runNotifications() })));

const here = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(here, '..', 'public')));

const port = Number(process.env.PORT || 3000);
app.listen(port, () => { console.log(`Adeies στο http://localhost:${port}`); startNotifier(); });
