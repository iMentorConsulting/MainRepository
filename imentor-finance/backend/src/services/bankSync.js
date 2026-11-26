// Pull new movements from the connected bank(s) and feed them to ingest() (dedupe + categorize + alerts).
const BankConnection = require('../models/BankConnection');
const { ingest } = require('./bankIngest');
const { getProvider } = require('./bankProviders');
const { pickIpv4 } = require('./clientIp');

const DAY = 86400000;
const iso = d => new Date(d).toISOString().slice(0, 10);
let running = false;

// Store what the provider told us about a consent (Connected → active; PendingSCAData/Processing → pending)
async function applyConsentResult(conn, r, psuIp = '') {
  const pending = r.status !== 'active';
  await conn.update({
    status: pending ? 'pending' : 'active',
    consent_id: r.consentId || conn.consent_id,
    consent_expires_at: r.expiresAt || conn.consent_expires_at,
    sca_type: r.scaType || '',
    last_error: pending ? (r.scaType === 'SMS' ? 'Απαιτείται ο κωδικός OTP που στάλθηκε με SMS.' : 'Η σύνδεση ολοκληρώνεται…') : '',
    ...(pickIpv4(psuIp) ? { psu_ip: pickIpv4(psuIp) } : {}),
  });
  return conn;
}

// Pending connections (Processing / waiting for OTP) are re-checked on every sync
async function refreshPending(provider, psuIp) {
  const pend = await BankConnection.findAll({ where: { provider: provider.key(), status: 'pending' } });
  for (const c of pend) {
    if (!c.consent_id) continue;
    try { await applyConsentResult(c, await provider.completeConsent({ connection: c, query: {}, psuIp: psuIp || c.psu_ip })); }
    catch (e) { await c.update(/AccessDenied/.test(e.message) ? { status: 'error', last_error: e.message } : { last_error: e.message }); }  // transient problems keep the status
  }
}

// First sync pulls a wide window; later ones only the recent past (overlap is safe: duplicates are skipped).
function syncWindow(conn, now = Date.now(), forceDays = 0) {
  const days = forceDays || (conn.last_sync_at ? Number(process.env.BANK_SYNC_OVERLAP_DAYS || 7) : Number(process.env.BANK_INITIAL_DAYS || 90));
  return { from: iso(now - days * DAY), to: iso(now) };
}

async function syncConnection(conn, { psuIp = '', deps = {}, now = Date.now(), days = 0 } = {}) {
  const provider = getProvider();
  if (conn.consent_expires_at && new Date(conn.consent_expires_at).getTime() < now) {
    await conn.update({ status: 'expired', last_error: 'Η συγκατάθεση έχει λήξει. Απαιτείται ανανέωση.' });
    return { bank: conn.bank, ok: false, error: 'consent expired' };
  }
  try {
    if (pickIpv4(psuIp) && pickIpv4(psuIp) !== conn.psu_ip) await conn.update({ psu_ip: pickIpv4(psuIp) });   // remember the latest interactive IP for scheduled runs
    const rows = await provider.fetchTransactions({ connection: conn, ...syncWindow(conn, now, days), psuIp: psuIp || conn.psu_ip });
    const res = await ingest(conn.bank, rows, { isTest: provider.env ? provider.env() !== 'production' : false, ...deps });
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
    const provider = getProvider();
    await refreshPending(provider, opts.psuIp);
    const conns = await BankConnection.findAll({ where: { provider: provider.key(), status: 'active' }, order: ['id'] });
    const results = [];
    for (const c of conns) results.push(await syncConnection(c, opts));
    return { skipped: false, results };
  } finally { running = false; }
}

module.exports = { syncConnection, syncAll, syncWindow, applyConsentResult };
