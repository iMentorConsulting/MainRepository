import { db, getSetting } from './db.js';
import { sendMail } from './mail.js';
import { iso, workingDays, LEAVE_TYPES, DEPARTMENTS } from './rules.js';

const fmt = (s) => s.split('-').reverse().join('/');
const addDays = (s, n) => iso(new Date(new Date(`${s}T00:00:00Z`).getTime() + n * 86400000));

// Στέλνει ειδοποίηση στον admin για εγκεκριμένες άδειες που ξεκινούν σε N ημέρες (μία φορά ανά άδεια και N).
export async function runNotifications(today = iso(new Date())) {
  const offsets = getSetting('notify_days', '7,2').split(',').map((n) => Number(n.trim())).filter((n) => n > 0).sort((a, b) => a - b);
  const to = getSetting('admin_email', '');
  if (!to) return 0;
  let sent = 0;
  for (const [i, n] of offsets.entries()) {
    // Παράθυρο ανά όριο: (προηγούμενο μικρότερο όριο, n] — έτσι κάθε άδεια παίρνει ένα email ανά όριο που διασχίζει
    const from = i === 0 ? today : addDays(today, offsets[i - 1] + 1);
    const target = addDays(today, n);
    const rows = db.prepare(`
      SELECT l.*, e.name, e.department FROM leaves l JOIN employees e ON e.id = l.employee_id
      WHERE l.status = 'approved' AND l.start BETWEEN ? AND ?
        AND NOT EXISTS (SELECT 1 FROM notifications_sent s WHERE s.leave_id = l.id AND s.days_before = ?)
      ORDER BY l.start`).all(from, target, n);
    if (!rows.length) continue;
    const lines = rows.map((l) => {
      const d = workingDays(l.start, l.end).length;
      return `• ${l.name} (${DEPARTMENTS[l.department]}) — ${LEAVE_TYPES[l.type]}: ${fmt(l.start)} – ${fmt(l.end)} (${d} εργάσιμες)`;
    });
    try {
      await sendMail({ to, subject: `Επερχόμενες άδειες (εντός ${n} ημερών)`, text: `Καλημέρα,\n\nΟι παρακάτω άδειες ξεκινούν εντός ${n} ημερών:\n\n${lines.join('\n')}\n\n— Adeies, iMentor Consulting` });
      const mark = db.prepare('INSERT OR IGNORE INTO notifications_sent (leave_id, days_before) VALUES (?, ?)');
      for (const l of rows) mark.run(l.id, n);
      sent += rows.length;
    } catch (err) {
      console.error('[notifier] αποτυχία αποστολής:', err.message);
    }
  }
  return sent;
}

export function startNotifier() {
  const tick = () => runNotifications().catch((e) => console.error('[notifier]', e));
  setTimeout(tick, 15000);
  setInterval(tick, 6 * 3600 * 1000);
}
