import crypto from 'node:crypto';

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(pw, salt, 64).toString('hex')}`;
}
export function verifyPassword(pw, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const a = Buffer.from(hash, 'hex');
  const b = crypto.scryptSync(pw, salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.SESSION_SECRET) console.warn('[auth] Δεν έχει οριστεί SESSION_SECRET — οι συνδέσεις λήγουν σε κάθε επανεκκίνηση.');
const TTL_MS = 12 * 3600 * 1000;

const sign = (payload) => crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');

// subject: 'admin' ή id εργαζομένου
export function makeToken(subject) {
  const payload = `${subject}.${Date.now() + TTL_MS}`;
  return `${payload}.${sign(payload)}`;
}
export function readToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const payload = `${parts[0]}.${parts[1]}`;
  const sig = Buffer.from(sign(payload));
  const given = Buffer.from(parts[2]);
  if (sig.length !== given.length || !crypto.timingSafeEqual(sig, given)) return null;
  if (Number(parts[1]) < Date.now()) return null;
  return parts[0];
}
export const parseCookies = (header = '') =>
  Object.fromEntries(header.split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
