// Store parsed bank rows, skip duplicates, auto-categorize, and alert about NEW credits
// (Viber via the existing Chatwoot sender + live toast via the existing SSE notifier).
const crypto = require('crypto');
const { Op } = require('sequelize');
const BankTransaction = require('../models/BankTransaction');
const { categorize } = require('./bankCategorize');

const BANKS = { alpha: 'Alpha Bank', piraeus: 'Πειραιώς', eurobank: 'Eurobank' };

function formatEur(cents) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}${euros},${String(abs % 100).padStart(2, '0')} €`;
}

function fingerprint(bank, row, n) {
  const desc = (row.description || '').toUpperCase().split(/\s+/).filter(Boolean).join(' ');
  return crypto.createHash('sha256')
    .update([bank, row.account || '', row.tx_date, row.cents, desc, n].join('|')).digest('hex');
}

function buildMessage(bank, rows, maxLines = 8) {
  const credits = rows.filter(r => r.cents > 0);
  const debits = rows.length - credits.length;
  let head = `💰 ${BANKS[bank]}: ` + (credits.length === 1 ? 'νέα πίστωση' : `${credits.length} νέες πιστώσεις`);
  if (debits) head += `, ${debits} νέες χρεώσεις`;
  const lines = [head];
  [...rows].sort((a, b) => Math.abs(b.cents) - Math.abs(a.cents)).slice(0, maxLines).forEach(r => {
    lines.push(`${r.cents > 0 ? '+' : ''}${formatEur(r.cents)} · ${r.tx_date} · ${(r.counterparty || r.description || '').slice(0, 60)}`);
  });
  if (rows.length > maxLines) lines.push(`… και ${rows.length - maxLines} ακόμη`);
  if (credits.length > 1) lines.push(`Σύνολο πιστώσεων: ${formatEur(credits.reduce((s, r) => s + r.cents, 0))}`);
  return lines.join('\n');
}

// deps are injectable so tests don't touch Viber / SSE
async function ingest(bank, rows, deps = {}) {
  if (!BANKS[bank]) throw new Error(`Άγνωστη τράπεζα: ${bank}`);
  const sendViber = deps.sendViber || require('./viberNotify').sendViberMessage;
  const broadcast = deps.broadcast || require('./notifier').broadcast;
  const maxAgeDays = Number(process.env.BANK_NOTIFY_MAX_AGE_DAYS || 3);
  const notifyDebits = process.env.BANK_NOTIFY_DEBITS === 'true';
  const today = deps.today || new Date().toISOString().slice(0, 10);

  // identical rows (same day/amount/text) are legitimate: count occurrences within the file
  const counts = new Map();
  const prepared = rows.map(r => {
    const key = [r.account || '', r.tx_date, r.cents, (r.description || '').toUpperCase()].join('|');
    const n = (counts.get(key) || 0) + 1;
    counts.set(key, n);
    return { ...r, fp: fingerprint(bank, r, n) };
  });

  const existing = new Set();
  const fps = prepared.map(p => p.fp);
  for (let i = 0; i < fps.length; i += 500) {
    const found = await BankTransaction.findAll({ where: { fingerprint: { [Op.in]: fps.slice(i, i + 500) } }, attributes: ['fingerprint'], raw: true });
    found.forEach(f => existing.add(f.fingerprint));
  }
  const fresh = prepared.filter(p => !existing.has(p.fp));

  const created = await BankTransaction.bulkCreate(fresh.map(p => ({
    bank, account: p.account || '', tx_date: p.tx_date, amount: (p.cents / 100).toFixed(2),
    description: p.description || '', counterparty: p.counterparty || '',
    direction: p.cents > 0 ? 'credit' : 'debit', fingerprint: p.fp,
    category: p.cents < 0 ? categorize(p.description, p.counterparty) : '',  // expense rules apply to debits only
  })), { returning: true });

  const cutoff = new Date(Date.parse(today) - maxAgeDays * 86400000).toISOString().slice(0, 10);
  const toNotify = fresh
    .map((p, i) => ({ p, id: created[i].id }))
    .filter(({ p }) => p.tx_date >= cutoff && (p.cents > 0 || notifyDebits));

  let notifyError = '';
  if (toNotify.length) {
    try {
      const text = buildMessage(bank, toNotify.map(x => x.p));
      broadcast('new_bank_transactions', {
        bank, bank_label: BANKS[bank], count: toNotify.length,
        total_cents: toNotify.reduce((s, x) => s + (x.p.cents > 0 ? x.p.cents : 0), 0),
        text,
      });
      await sendViber(text);
      await BankTransaction.update({ notified: true }, { where: { id: toNotify.map(x => x.id) } });
    } catch (e) {
      notifyError = e.message;                 // never lose an import because Viber is down
      console.warn('[bank-ingest] notification failed:', e.message);
    }
  }
  return { new: fresh.length, duplicates: rows.length - fresh.length, notified: notifyError ? 0 : toNotify.length, notify_error: notifyError };
}

module.exports = { BANKS, ingest, buildMessage, formatEur };
