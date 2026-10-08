const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (s) => s.split('-').reverse().join('/');
const MONTHS = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'];
const STATUS = { pending: 'Εκκρεμεί', approved: 'Εγκρίθηκε', rejected: 'Απορρίφθηκε' };

async function api(path, method = 'GET', body) {
  const res = await fetch(`/api${path}`, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/login') { me = null; render(); throw new Error('Απαιτείται σύνδεση.'); }
  if (!res.ok) { const e = new Error(data.error || 'Σφάλμα.'); e.data = data; throw e; }
  return data;
}

let me = null, tab = 'calendar', cursor = new Date(), flash = null;
const app = $('#app');
const setFlash = (text, ok = false) => { flash = { text, ok }; };
const flashHtml = () => { const f = flash; flash = null; return f ? `<div class="msg ${f.ok ? 'ok' : ''}">${esc(f.text)}</div>` : ''; };

async function boot() { try { me = await api('/me'); } catch { me = null; } render(); }

async function render() {
  if (!me) return renderLogin();
  const isAdmin = me.role === 'admin';
  const tabs = [['calendar', 'Ημερολόγιο'], ...(isAdmin ? [['requests', 'Αιτήσεις'], ['register', 'Καταχώρηση'], ['people', 'Εργαζόμενοι'], ['blocked', 'Μπλοκαρισμένες ημέρες'], ['settings', 'Ειδοποιήσεις']] : [['mine', 'Οι άδειές μου']])];
  app.innerHTML = `<header><h1>Adeies <span>· iMentor Consulting</span></h1><span>${esc(me.user.name)}</span>
    ${isAdmin ? '' : '<button class="sec sm" id="pw">Αλλαγή κωδικού</button>'}<button class="sec sm" id="out">Έξοδος</button></header>
    <nav>${tabs.map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</nav><main id="view"></main>`;
  app.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { tab = b.dataset.tab; render(); });
  $('#out').onclick = async () => { await api('/logout', 'POST'); me = null; render(); };
  if ($('#pw')) $('#pw').onclick = changePassword;
  try { await ({ calendar: viewCalendar, mine: viewMine, requests: viewRequests, register: viewRegister, people: viewPeople, blocked: viewBlocked, settings: viewSettings }[tab])($('#view')); }
  catch (e) { if (me) $('#view').innerHTML = `<div class="msg">${esc(e.message)}</div>`; }
}

async function renderLogin() {
  const names = await fetch('/api/login-options').then((r) => r.json());
  app.innerHTML = `<div class="login"><h1 style="text-align:center">Adeies</h1><form class="card" id="f">${flashHtml()}
    <label>Χρήστης<select name="username">${names.map((n) => `<option>${esc(n)}</option>`).join('')}<option value="admin">Διαχειριστής</option></select></label>
    <label>Κωδικός<input type="password" name="password" required autofocus></label><button class="pri">Σύνδεση</button></form></div>`;
  $('#f').onsubmit = async (ev) => {
    ev.preventDefault(); const d = Object.fromEntries(new FormData(ev.target));
    try { await api('/login', 'POST', d); tab = 'calendar'; await boot(); } catch (e) { setFlash(e.message); renderLogin(); }
  };
}

function changePassword() {
  const current = prompt('Τρέχων κωδικός:'); if (current === null) return;
  const next = prompt('Νέος κωδικός (τουλάχιστον 8 χαρακτήρες):'); if (next === null) return;
  api('/me/password', 'POST', { current, next }).then(() => alert('Ο κωδικός άλλαξε.')).catch((e) => alert(e.message));
}

// ---------- Ημερολόγιο ----------
async function viewCalendar(el) {
  const y = cursor.getFullYear(), m = cursor.getMonth();
  const pad = (n) => String(n).padStart(2, '0');
  const first = new Date(Date.UTC(y, m, 1)), last = new Date(Date.UTC(y, m + 1, 0));
  const from = `${y}-${pad(m + 1)}-01`, to = `${y}-${pad(m + 1)}-${pad(last.getUTCDate())}`;
  const data = await api(`/calendar?from=${from}&to=${to}`);
  const hol = new Set(data.holidays), startOffset = (first.getUTCDay() + 6) % 7, todayIso = new Date().toISOString().slice(0, 10);
  let cells = ['Δευ', 'Τρί', 'Τετ', 'Πέμ', 'Παρ', 'Σάβ', 'Κυρ'].map((d) => `<div class="dow">${d}</div>`).join('');
  for (let i = 0; i < startOffset; i++) cells += '<div></div>';
  for (let d = 1; d <= last.getUTCDate(); d++) {
    const iso = `${y}-${pad(m + 1)}-${pad(d)}`, dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
    const off = dow === 0 || dow === 6 || hol.has(iso);
    const blocked = data.blocked.find((b) => b.start <= iso && iso <= b.end);
    const chips = off ? '' : data.leaves.filter((l) => l.start <= iso && iso <= l.end).map((l) =>
      `<span class="chip ${l.department} ${l.status}" title="${esc(l.name)} — ${esc(me.types[l.type])} (${STATUS[l.status]})">${esc(l.name)}${l.type !== 'annual' ? ' ·' + esc(me.types[l.type].slice(0, 4)) : ''}</span>`).join('');
    cells += `<div class="day ${off ? 'off' : ''} ${blocked ? 'blocked' : ''} ${iso === todayIso ? 'today' : ''}"><div class="n"><span>${d}</span>${hol.has(iso) ? '<span>Αργία</span>' : ''}</div>${blocked ? `<div style="color:var(--bad)">⛔ ${esc(blocked.reason || 'Μπλοκαρισμένη')}</div>` : ''}${chips}</div>`;
  }
  el.innerHTML = `<div class="card"><div class="cal-head"><h2>${MONTHS[m]} ${y}</h2><button class="sec sm" id="p">←</button><button class="sec sm" id="t">Σήμερα</button><button class="sec sm" id="n">→</button></div>
    <div class="grid">${cells}</div>
    <div class="legend"><span style="color:var(--grants)">■ ${esc(me.departments.grants)}</span><span style="color:var(--debts)">■ ${esc(me.departments.debts)}</span><span>Αχνό = εκκρεμεί έγκριση</span><span style="color:var(--bad)">⛔ Μπλοκαρισμένες ημέρες</span></div></div>`;
  $('#p').onclick = () => { cursor = new Date(y, m - 1, 1); render(); };
  $('#n').onclick = () => { cursor = new Date(y, m + 1, 1); render(); };
  $('#t').onclick = () => { cursor = new Date(); render(); };
}

// ---------- Εργαζόμενος ----------
async function viewMine(el) {
  me = await api('/me');
  const b = me.balance, list = await api('/leaves/mine');
  el.innerHTML = `${flashHtml()}<div class="card"><h2>Υπόλοιπο ${b.year}</h2><div class="stats">
    <div class="stat"><b>${b.total}</b>Σύνολο</div><div class="stat"><b>${b.used}</b>Εγκεκριμένες</div><div class="stat"><b>${b.pending}</b>Εκκρεμείς</div><div class="stat"><b>${b.remaining}</b>Υπόλοιπο</div></div></div>
    <div class="card"><h2>Νέα αίτηση κανονικής άδειας</h2><form id="f" class="row">
    <label>Από<input type="date" name="start" required></label><label>Έως<input type="date" name="end" required></label>
    <label style="flex:1;min-width:160px">Σημείωση<input name="note" maxlength="500"></label><button class="pri">Υποβολή</button></form><div id="err"></div></div>
    <div class="card"><h2>Ιστορικό</h2>${leaveTable(list, true)}</div>`;
  $('#f').onsubmit = async (ev) => {
    ev.preventDefault(); const d = Object.fromEntries(new FormData(ev.target));
    try { await api('/leaves', 'POST', d); setFlash('Η αίτηση υποβλήθηκε και αναμένει έγκριση.', true); render(); } catch (e) { $('#err').innerHTML = `<div class="msg">${esc(e.message)}</div>`; }
  };
  bindCancel(el);
}
function leaveTable(rows, cancel, admin) {
  if (!rows.length) return '<p style="color:var(--mut)">Καμία εγγραφή.</p>';
  return `<table><tr>${admin ? '<th>Εργαζόμενος</th>' : ''}<th>Τύπος</th><th>Διάστημα</th><th>Κατάσταση</th><th>Σημείωση</th><th></th></tr>${rows.map((l) =>
    `<tr>${admin ? `<td>${esc(l.name)}<br><small>${esc(me.departments[l.department])}</small></td>` : ''}<td>${esc(me.types[l.type])}</td><td>${fmt(l.start)} – ${fmt(l.end)}</td>
    <td><span class="tag ${l.status}">${STATUS[l.status]}</span></td><td>${esc(l.note)}${l.decision_note ? `<br><small>↳ ${esc(l.decision_note)}</small>` : ''}</td>
    <td>${cancel && (l.status === 'pending' || l.status === 'approved') ? `<button class="bad sm" data-cancel="${l.id}">Ακύρωση</button>` : ''}</td></tr>`).join('')}</table>`;
}
function bindCancel(el) {
  el.querySelectorAll('[data-cancel]').forEach((b) => b.onclick = async () => {
    if (!confirm('Ακύρωση της άδειας;')) return;
    try { await api(`/leaves/${b.dataset.cancel}/cancel`, 'POST'); render(); } catch (e) { alert(e.message); }
  });
}

// ---------- Admin ----------
async function viewRequests(el) {
  const [pending, all] = await Promise.all([api('/admin/leaves?status=pending'), api('/admin/leaves')]);
  el.innerHTML = `${flashHtml()}<div class="card"><h2>Εκκρεμείς αιτήσεις (${pending.length})</h2>${pending.length ? `<table><tr><th>Εργαζόμενος</th><th>Διάστημα</th><th>Σημείωση</th><th></th></tr>${pending.map((l) =>
    `<tr><td>${esc(l.name)}<br><small>${esc(me.departments[l.department])}</small></td><td>${fmt(l.start)} – ${fmt(l.end)}</td><td>${esc(l.note)}</td>
    <td><button class="pri sm" data-ok="${l.id}">Έγκριση</button> <button class="bad sm" data-no="${l.id}">Απόρριψη</button></td></tr>`).join('')}</table>` : '<p style="color:var(--mut)">Δεν υπάρχουν εκκρεμείς αιτήσεις.</p>'}</div>
    <div class="card"><h2>Όλες οι άδειες</h2>${leaveTable(all, true, true)}</div>`;
  el.querySelectorAll('[data-ok]').forEach((b) => b.onclick = async () => {
    try { await api(`/admin/leaves/${b.dataset.ok}/approve`, 'POST', {}); setFlash('Εγκρίθηκε και προστέθηκε στο ημερολόγιο.', true); }
    catch (e) {
      if (e.data?.canForce && confirm(`${e.message}\n\nΕγκρίνετε παρ' όλα αυτά;`)) { await api(`/admin/leaves/${b.dataset.ok}/approve`, 'POST', { force: true }); setFlash('Εγκρίθηκε (παράκαμψη κανόνων).', true); }
      else if (!e.data?.canForce) setFlash(e.message);
    }
    render();
  });
  el.querySelectorAll('[data-no]').forEach((b) => b.onclick = async () => {
    const note = prompt('Αιτιολογία απόρριψης (προαιρετικά):'); if (note === null) return;
    await api(`/admin/leaves/${b.dataset.no}/reject`, 'POST', { note }); render();
  });
  bindCancel(el);
}

async function viewRegister(el) {
  const { employees } = await api('/calendar');
  el.innerHTML = `${flashHtml()}<div class="card"><h2>Καταχώρηση έκτακτης άδειας</h2><p style="color:var(--mut);margin-top:0">Εγκρίνεται άμεσα, εμφανίζεται στο ημερολόγιο και δεν αφαιρείται από τις 22 ημέρες κανονικής άδειας.</p>
    <form id="f" class="row"><label>Εργαζόμενος<select name="employee_id">${employees.map((e) => `<option value="${e.id}">${esc(e.name)}</option>`).join('')}</select></label>
    <label>Τύπος<select name="type">${me.specialTypes.map((t) => `<option value="${t}">${esc(me.types[t])}</option>`).join('')}<option value="annual">${esc(me.types.annual)} (εκ μέρους εργαζομένου)</option></select></label>
    <label>Από<input type="date" name="start" required></label><label>Έως<input type="date" name="end" required></label>
    <label style="flex:1;min-width:160px">Σημείωση<input name="note"></label><button class="pri">Καταχώρηση</button></form><div id="err"></div></div>`;
  $('#f').onsubmit = async (ev) => {
    ev.preventDefault(); const d = Object.fromEntries(new FormData(ev.target));
    try { await api('/admin/leaves', 'POST', d); setFlash('Η άδεια καταχωρήθηκε.', true); render(); } catch (e) { $('#err').innerHTML = `<div class="msg">${esc(e.message)}</div>`; }
  };
}

async function viewPeople(el) {
  const rows = await api('/admin/balances');
  el.innerHTML = `${flashHtml()}<div class="card"><h2>Εργαζόμενοι & ετήσιες άδειες</h2><table><tr><th>Όνομα</th><th>Τμήμα</th><th>Ετήσιες ημέρες</th><th>Εγκεκρ.</th><th>Εκκρεμείς</th><th>Υπόλοιπο</th><th></th></tr>${rows.map((r) =>
    `<tr><td>${esc(r.name)}</td><td>${esc(me.departments[r.department])}</td><td><input type="number" min="0" max="100" value="${r.total}" style="width:70px" data-days="${r.employee_id}"></td>
    <td>${r.used}</td><td>${r.pending}</td><td>${r.remaining}</td><td><button class="sec sm" data-pw="${r.employee_id}" data-name="${esc(r.name)}">Νέος κωδικός</button></td></tr>`).join('')}</table>
    <p style="color:var(--mut)">Οι ημέρες αφορούν εργάσιμες (Δευ–Παρ, εκτός αργιών). Αλλάξτε την τιμή και πατήστε εκτός πεδίου για αποθήκευση.</p></div>`;
  el.querySelectorAll('[data-days]').forEach((i) => i.onchange = async () => {
    try { await api(`/admin/employees/${i.dataset.days}`, 'PATCH', { annual_days: Number(i.value) }); setFlash('Αποθηκεύτηκε.', true); } catch (e) { setFlash(e.message); }
    render();
  });
  el.querySelectorAll('[data-pw]').forEach((b) => b.onclick = async () => {
    const pw = prompt(`Νέος κωδικός για ${b.dataset.name} (τουλάχιστον 8 χαρακτήρες):`); if (!pw) return;
    try { await api(`/admin/employees/${b.dataset.pw}/reset-password`, 'POST', { password: pw }); setFlash('Ο κωδικός άλλαξε.', true); } catch (e) { setFlash(e.message); }
    render();
  });
}

async function viewBlocked(el) {
  const { blocked } = await api('/calendar?from=2000-01-01&to=2100-12-31');
  el.innerHTML = `${flashHtml()}<div class="card"><h2>Μπλοκαρισμένες ημέρες άδειας</h2>
    <form id="f" class="row"><label>Από<input type="date" name="start" required></label><label>Έως<input type="date" name="end" required></label>
    <label style="flex:1;min-width:160px">Λόγος<input name="reason" placeholder="π.χ. Προθεσμία υποβολής"></label><button class="pri">Προσθήκη</button></form><div id="err"></div></div>
    <div class="card">${blocked.length ? `<table><tr><th>Διάστημα</th><th>Λόγος</th><th></th></tr>${blocked.map((b) => `<tr><td>${fmt(b.start)} – ${fmt(b.end)}</td><td>${esc(b.reason)}</td><td><button class="bad sm" data-del="${b.id}">Διαγραφή</button></td></tr>`).join('')}</table>` : '<p style="color:var(--mut)">Δεν υπάρχουν μπλοκαρισμένες ημέρες.</p>'}</div>`;
  $('#f').onsubmit = async (ev) => {
    ev.preventDefault(); try { await api('/admin/blocked', 'POST', Object.fromEntries(new FormData(ev.target))); render(); } catch (e) { $('#err').innerHTML = `<div class="msg">${esc(e.message)}</div>`; }
  };
  el.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { await api(`/admin/blocked/${b.dataset.del}`, 'DELETE'); render(); });
}

async function viewSettings(el) {
  const s = await api('/admin/settings');
  el.innerHTML = `${flashHtml()}<div class="card"><h2>Ειδοποιήσεις email προς τον admin</h2>
    ${s.smtp_configured ? '' : '<div class="msg">Ο διακομιστής email (SMTP) δεν έχει ρυθμιστεί — τα email καταγράφονται μόνο στα logs. Δείτε το README.</div>'}
    <form id="f" class="row"><label>Email admin<input type="email" name="admin_email" value="${esc(s.admin_email)}" required></label>
    <label>Ειδοποίηση πριν από (ημέρες, με κόμμα)<input name="notify_days" value="${esc(s.notify_days)}" required></label><button class="pri">Αποθήκευση</button></form>
    <p style="color:var(--mut)">Π.χ. «7,2»: λαμβάνετε email 7 και 2 ημέρες πριν ξεκινήσει κάθε εγκεκριμένη άδεια. Λαμβάνετε επίσης email σε κάθε νέα αίτηση.</p>
    <div class="row"><button class="sec" id="test">Αποστολή δοκιμαστικού email</button><button class="sec" id="run">Έλεγχος ειδοποιήσεων τώρα</button></div><div id="err"></div></div>`;
  $('#f').onsubmit = async (ev) => { ev.preventDefault(); try { await api('/admin/settings', 'PUT', Object.fromEntries(new FormData(ev.target))); setFlash('Αποθηκεύτηκε.', true); } catch (e) { setFlash(e.message); } render(); };
  $('#test').onclick = async () => { const r = await api('/admin/test-email', 'POST'); $('#err').innerHTML = `<div class="msg ${r.sent ? 'ok' : ''}">${r.sent ? 'Στάλθηκε.' : `Δεν στάλθηκε: ${esc(r.reason)}`}</div>`; };
  $('#run').onclick = async () => { const r = await api('/admin/run-notifications', 'POST'); $('#err').innerHTML = `<div class="msg ok">Ειδοποιήσεις για ${r.sent} άδειες.</div>`; };
}

boot();
