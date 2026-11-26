// Needs Postgres:  BANK_E2E_DATABASE_URL=postgres://... npm test   (drops & recreates the bank tables!)
const URL_ = process.env.BANK_E2E_DATABASE_URL;
const skip = URL_ ? false : 'set BANK_E2E_DATABASE_URL to run the database test';
if (URL_) process.env.DATABASE_URL = URL_;
process.env.JWT_SECRET = 'test-secret';
process.env.BANK_PROVIDER = 'mock';

const test = require('node:test');
const assert = require('node:assert/strict');

test('consent flow → first sync → alerts → dedupe → expiry', { skip }, async () => {
  const express = require('express');
  const sequelize = require('../src/config/db');
  const BankTransaction = require('../src/models/BankTransaction');
  const BankConnection = require('../src/models/BankConnection');
  await BankTransaction.sync({ force: true });
  await BankConnection.sync({ force: true });

  const app = express();
  app.use(express.json());
  app.use('/api/bank/callback', require('../src/routes/bankCallback'));
  app.use('/api/bank', (req, _res, next) => next(), require('../src/routes/bank')); // auth is covered by its own test
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const api = (p, o = {}) => fetch(base + p, { redirect: 'manual', headers: { 'Content-Type': 'application/json' }, ...o });

  // 1. nothing connected yet, 4 banks offered
  let list = await (await api('/api/bank/connections')).json();
  assert.equal(list.provider, 'mock');
  assert.deepEqual(list.connections.map(c => c.bank).sort(), ['alpha', 'eurobank', 'nbg', 'piraeus']);
  assert.ok(list.connections.every(c => c.status === 'none'));

  // 2. start consent for Alpha → bank "login" URL → user returns to the callback
  const start = await (await api('/api/bank/connections', { method: 'POST', body: JSON.stringify({ bank: 'alpha' }) })).json();
  assert.match(start.redirect_url, /\/api\/bank\/callback\?state=/);
  const cb = await fetch(start.redirect_url.replace(/^https?:\/\/[^/]+/, base), { redirect: 'manual' });
  assert.equal(cb.status, 302);
  assert.equal(cb.headers.get('location'), '/bank?bank_connected=alpha');

  const conn = await BankConnection.findOne({ where: { bank: 'alpha' } });
  assert.equal(conn.status, 'active');
  const days = (new Date(conn.consent_expires_at) - Date.now()) / 86400000;
  assert.ok(days > 179 && days <= 180, `consent should last ~180 days, got ${days}`);

  // 3. the callback kicks off the first (wide) sync in the background
  for (let i = 0; i < 50 && !(await BankTransaction.count()); i++) await new Promise(r => setTimeout(r, 100));
  const n1 = await BankTransaction.count();
  assert.ok(n1 > 10, `first sync should import ~90 days of history, got ${n1}`);
  assert.ok(await BankTransaction.count({ where: { direction: 'debit', category: 'Λογαριασμοί (ΔΕΗ/νερό/τηλ.)' } }) >= 1, 'debits are auto-categorized');

  // 4. "Ανανέωση τώρα" again: nothing new, nothing duplicated
  const sync = await (await api('/api/bank/sync', { method: 'POST' })).json();
  assert.equal(sync.results.length, 1);
  assert.equal(sync.results[0].ok, true);
  assert.equal(sync.results[0].new, 0);
  assert.equal(await BankTransaction.count(), n1);

  // 5. bad / foreign state is rejected without touching anything
  for (const state of ['nope', require('jsonwebtoken').sign({ purpose: 'bank-consent', cid: conn.id }, 'test-secret')]) {
    const bad = await fetch(`${base}/api/bank/callback?state=${state}`, { redirect: 'manual' });
    assert.match(bad.headers.get('location'), /bank_error=/);
  }

  // 6. renewal reminder: once per day, only when ≤ 7 days left
  const { checkExpiry } = require('../src/services/bankScheduler');
  const sent = [];
  assert.equal(await checkExpiry(Date.now(), async t => sent.push(t)), 0);          // 180 days left → silent
  await conn.update({ consent_expires_at: new Date(Date.now() + 3 * 86400000) });
  assert.equal(await checkExpiry(Date.now(), async t => sent.push(t)), 1);
  assert.match(sent[0], /Alpha Bank: λήγει σε 3 ημέρες/);
  assert.equal(await checkExpiry(Date.now(), async t => sent.push(t)), 0);          // not again the same day

  // 7. expired consent is detected and sync stops for that bank
  await conn.update({ consent_expires_at: new Date(Date.now() - 1000) });
  const after = await (await api('/api/bank/sync', { method: 'POST' })).json();
  assert.equal(after.results[0].ok, false);
  assert.equal((await BankConnection.findOne({ where: { bank: 'alpha' } })).status, 'expired');
  list = await (await api('/api/bank/connections')).json();
  assert.equal(list.connections.find(c => c.bank === 'alpha').status, 'expired');

  server.close();
});

test('Piraeus asks for an SMS OTP: pending → wrong code rejected → right code → active + first sync', { skip }, async () => {
  const express = require('express');
  const sequelize = require('../src/config/db');
  const BankTransaction = require('../src/models/BankTransaction');
  const BankConnection = require('../src/models/BankConnection');
  await BankTransaction.destroy({ where: {} });
  const app = express(); app.use(express.json());
  app.use('/api/bank/callback', require('../src/routes/bankCallback'));
  app.use('/api/bank', require('../src/routes/bank'));
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const api = (p, body) => fetch(base + p, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

  const start = await (await api('/api/bank/connections', { bank: 'piraeus' })).json();
  const cb = await fetch(start.redirect_url.replace(/^https?:\/\/[^/]+/, base), { redirect: 'manual' });
  assert.equal(cb.headers.get('location'), '/bank?bank_pending=piraeus');
  let conn = await BankConnection.findOne({ where: { bank: 'piraeus' } });
  assert.equal(conn.status, 'pending'); assert.equal(conn.sca_type, 'SMS');
  const listed = await (await fetch(base + '/api/bank/connections')).json();
  assert.equal(listed.connections.find(c => c.bank === 'piraeus').sca_type, 'SMS');

  assert.equal((await api('/api/bank/connections/otp', { bank: 'piraeus', otp: 'abc' })).status, 400);        // malformed
  assert.equal((await api('/api/bank/connections/otp', { bank: 'piraeus', otp: '000000' })).status, 400);     // wrong code
  assert.equal((await api('/api/bank/connections/otp', { bank: 'alpha', otp: '123456' })).status, 404);       // nothing pending there
  const ok = await api('/api/bank/connections/otp', { bank: 'piraeus', otp: '123456' });
  assert.equal(ok.status, 200);
  conn = await BankConnection.findOne({ where: { bank: 'piraeus' } });
  assert.equal(conn.status, 'active');
  for (let i = 0; i < 50 && !(await BankTransaction.count({ where: { bank: 'piraeus' } })); i++) await new Promise(r => setTimeout(r, 100));
  assert.ok(await BankTransaction.count({ where: { bank: 'piraeus' } }) > 10);

  // the callback also works when the bank does not echo our `state` but appends its connectionId
  const start2 = await (await api('/api/bank/connections', { bank: 'eurobank' })).json();
  const cb2 = await fetch(`${base}/api/bank/callback?connectionId=mock-eurobank`, { redirect: 'manual' });
  assert.equal(cb2.headers.get('location'), '/bank?bank_connected=eurobank');
  const none = await fetch(`${base}/api/bank/callback?connectionId=does-not-exist`, { redirect: 'manual' });
  assert.match(none.headers.get('location'), /bank_error=/);

  // a failed first attempt (e.g. NBG-S-006) leaves no half-created "Σε εξέλιξη" card; old stuck rows show as not connected
  process.env.MOCK_FAIL_START = 'true';
  const failed = await api('/api/bank/connections', { bank: 'nbg' });
  assert.equal(failed.status, 500);
  assert.equal(await BankConnection.count({ where: { bank: 'nbg' } }), 0);
  process.env.MOCK_FAIL_START = 'false';
  await BankConnection.create({ provider: 'mock', bank: 'nbg', status: 'pending' });          // what the earlier bug left behind
  const listed2 = await (await fetch(base + '/api/bank/connections')).json();
  assert.equal(listed2.connections.find(c => c.bank === 'nbg').status, 'none');
  await BankConnection.destroy({ where: { bank: 'nbg' } });

  // not configured real provider: clear refusal, nothing created
  process.env.BANK_PROVIDER = 'nbg'; delete process.env.NBG_CLIENT_ID;
  const refused = await api('/api/bank/connections', { bank: 'alpha' });
  assert.equal(refused.status, 409);
  process.env.BANK_PROVIDER = 'mock';

  server.close(); await sequelize.close();
});
