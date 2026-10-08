import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { hashPassword } from './auth.js';

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
mkdirSync(dataDir, { recursive: true });
export const db = new DatabaseSync(path.join(dataDir, 'adeies.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  department TEXT NOT NULL,            -- grants | debts
  annual_days INTEGER NOT NULL DEFAULT 22,
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS leaves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  type TEXT NOT NULL,
  start TEXT NOT NULL,
  end TEXT NOT NULL,
  status TEXT NOT NULL,                -- pending | approved | rejected
  note TEXT DEFAULT '',
  decision_note TEXT DEFAULT '',
  created_by TEXT NOT NULL,            -- employee | admin
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS blocked_days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  start TEXT NOT NULL,
  end TEXT NOT NULL,
  reason TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS notifications_sent (
  leave_id INTEGER NOT NULL,
  days_before INTEGER NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (leave_id, days_before)
);
`);

export function getSetting(key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}
export function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
}

// Αρχικά δεδομένα
if (db.prepare('SELECT COUNT(*) AS n FROM employees').get().n === 0) {
  const initial = process.env.INITIAL_PASSWORD || 'imentor2026';
  const ins = db.prepare('INSERT INTO employees (name, department, annual_days, password_hash) VALUES (?, ?, 22, ?)');
  for (const [name, dep] of [['Μάνος', 'grants'], ['Χρήστος', 'grants'], ['Ελευθερία', 'grants'], ['Σοφία', 'debts'], ['Στέλλα', 'debts'], ['Βάλια', 'debts']]) {
    ins.run(name, dep, hashPassword(initial));
  }
}
if (!db.prepare("SELECT 1 FROM settings WHERE key = 'admin_email'").get()) {
  setSetting('admin_email', process.env.ADMIN_EMAIL || 'info@i-mentor.gr');
  setSetting('notify_days', '7,2');
}
