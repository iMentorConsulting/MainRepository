// Pull new movements from the connected bank(s) and feed them to ingest() (dedupe + categorize + alerts).
const BankConnection = require('../models/BankConnection');
const { ingest } = require('./bankIngest');
const { getProvider } = require('./bankProviders');

const DAY = 86400000;
const iso = d => new Date(d).toISOString().slice(0, 10);
let running = false;

// First sync pulls a wide window; later ones only the recent past (overlap is safe: duplicates are skipped).
function syncWindow(conn, now = Date.now()) {
  const days = conn.last_sync_at ? Number(process.env.BANK_SYNC_OVERLAP_DAYS || 7) : Number(process.env.BANK_INITIAL_DAYS || 90);
  return { from: iso(now - days * DAY), to: iso(now) };
}

async function syncConnection(conn, { psuIp = '', deps = {}, now = Date.now() } = {}) {
  const provider = getProvider();
  if (conn.consent_expires_at && new Date(conn.consent_expires_at).getTime() < now) {
    await conn.update({ status: 'expired', last_error: 'Η συγκατάθεση έχει λήξει. Απαιτείται ανανέωση.' });
    return { bank: conn.bank, ok: false, error: 'consent expired' };
  }
  try {
    const rows = await provider.fetchTransactions({ connection: conn, ...syncWindow(conn, now), psuIp });
    const res = await ingest(conn.bank, rows, deps);
    await conn.update({ last_sync_at: new Date(now), last_error: '', status: 'active' });
    return { bank: conn.bank, ok: true, fetched: rows.length, ...res };
  } catch (e) {
    if (e.code === 'CONSENT_EXPIRED') await conn.update({ status: 'expired', last_error: 'Η συγκατάθεση έχει λήξει. Απαιτείται ανανέωση.' });
    else if (e.code !== 'PROVIDER_NOT_READY') await conn.update({ last_error: e.message });
    return { bank: conn.bank, ok: false, error: e.message };
  }
}

// Sync every active connection. A second call while one is running is skipped (cron vs. button).
async function syncAll(opts = {}) {
  if (running) return { skipped: true, results: [] };
  running = true;
  try {
    const conns = await BankConnection.findAll({ where: { provider: getProvider().name, status: 'active' }, order: ['id'] });
    const results = [];
    for (const c of conns) results.push(await syncConnection(c, opts));
    return { skipped: false, results };
  } finally { running = false; }
}

module.exports = { syncConnection, syncAll, syncWindow };
