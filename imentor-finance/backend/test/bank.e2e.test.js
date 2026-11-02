// Needs a real Postgres: run with  BANK_E2E_DATABASE_URL=postgres://... npm test
const test = require('node:test');
const assert = require('node:assert/strict');

const URL_ = process.env.BANK_E2E_DATABASE_URL;
const skip = URL_ ? false : 'set BANK_E2E_DATABASE_URL to run the database test';
if (URL_) process.env.DATABASE_URL = URL_;

test('ingest: stores, dedupes, notifies only fresh credits, survives Viber failure', { skip }, async () => {
  const sequelize = require('../src/config/db');
  const BankTransaction = require('../src/models/BankTransaction');
  const { ingest } = require('../src/services/bankIngest');
  await BankTransaction.sync({ force: true });

  const sent = [], events = [];
  const deps = { today: '2026-11-02', sendViber: async t => sent.push(t), broadcast: (e, d) => events.push([e, d]) };
  const rows = [
    { tx_date: '2026-11-01', cents: 123456, description: 'ΕΙΣΟΔΗΜΑ ACME', counterparty: 'ACME ΑΕ', account: 'GR1' },
    { tx_date: '2026-10-31', cents: -8520, description: 'ΔΕΗ ΛΟΓΑΡΙΑΣΜΟΣ', counterparty: '', account: 'GR1' },
    { tx_date: '2026-10-20', cents: 5000, description: 'POS', counterparty: '', account: 'GR1' },
    { tx_date: '2026-10-20', cents: 5000, description: 'POS', counterparty: '', account: 'GR1' }, // identical, legit
    { tx_date: '2026-01-01', cents: 99900, description: 'OLD', counterparty: '', account: 'GR1' },  // too old to ping
  ];

  const r1 = await ingest('alpha', rows, deps);
  assert.equal(r1.new, 5);
  assert.equal(r1.notified, 1);                      // only the 2026-11-01 credit is within the 3-day window
  assert.equal(sent.length, 1);
  assert.match(sent[0], /Alpha Bank: νέα πίστωση/);
  assert.equal(events[0][0], 'new_bank_transactions');
  assert.equal(await BankTransaction.count(), 5);

  const r2 = await ingest('alpha', rows, deps);      // same statement again
  assert.equal(r2.new, 0);
  assert.equal(r2.duplicates, 5);
  assert.equal(sent.length, 1);

  const cat = await BankTransaction.findOne({ where: { description: 'ΔΕΗ ΛΟΓΑΡΙΑΣΜΟΣ' } });
  assert.equal(cat.category, 'Λογαριασμοί (ΔΕΗ/νερό/τηλ.)');
  assert.equal(cat.direction, 'debit');
  assert.equal(Number(cat.amount), -85.2);
  assert.equal(cat.invoice_issued, null);
  // a credit that merely contains an expense keyword must NOT get an expense category
  const credit = await BankTransaction.findOne({ where: { description: 'ΕΙΣΟΔΗΜΑ ACME' } });
  assert.equal(credit.category, '');

  // Viber down: data is still saved, error is reported, nothing marked notified
  const down = { ...deps, sendViber: async () => { throw new Error('viber down'); } };
  const r3 = await ingest('eurobank', [{ tx_date: '2026-11-02', cents: 70000, description: 'X', counterparty: '', account: '' }], down);
  assert.equal(r3.new, 1);
  assert.equal(r3.notified, 0);
  assert.match(r3.notify_error, /viber down/);
  assert.equal(await BankTransaction.count({ where: { notified: true } }), 1);

  await sequelize.close();
});
