process.env.DATABASE_URL = process.env.BANK_E2E_DATABASE_URL || process.env.DATABASE_URL || 'postgres://u:p@localhost:5432/unused';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.BANK_PROVIDER = 'mock';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { signState, verifyState } = require('../src/services/bankState');
const { syncWindow } = require('../src/services/bankSync');
const authMiddleware = require('../src/middleware/auth');

test('state: only characters NBG accepts, round-trips, expires, tamper-proof, never a login token', () => {
  const state = signState(42);
  assert.match(state, /^[A-Za-z0-9_-]+$/, 'NBG-A-418: State may only contain alphanumerics, dashes and underscores');
  assert.ok(state.length < 60);
  assert.equal(verifyState(state).cid, 42);
  assert.throws(() => verifyState('garbage'));
  assert.throws(() => verifyState(state.replace(/.$/, c => (c === '0' ? '1' : '0'))), /signature/);   // tampered signature
  assert.throws(() => verifyState(state.replace('bc-42-', 'bc-43-')), /signature/);                      // tampered connection id
  assert.throws(() => verifyState(signState(42, 1000, Date.now() - 5000)), /expired/);                   // expired
  // a normal login token must not work as consent state, and the state must not authenticate API calls
  assert.throws(() => verifyState(jwt.sign({ purpose: 'bank-consent', cid: 1 }, process.env.JWT_SECRET)));
  let status = 0, nextCalled = false;
  authMiddleware({ headers: { authorization: `Bearer ${state}` } }, { status: c => ({ json: () => { status = c; } }) }, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(status, 401);
});

test('sync window: wide on first run, short overlap afterwards', () => {
  const now = Date.parse('2026-11-26T12:00:00Z');
  assert.deepEqual(syncWindow({ last_sync_at: null }, now), { from: '2026-08-28', to: '2026-11-26' });
  assert.deepEqual(syncWindow({ last_sync_at: new Date(now - 3600e3) }, now), { from: '2026-11-19', to: '2026-11-26' });
});

test('pickIpv4 finds an IPv4 in the forwarded chain and ignores IPv6', () => {
  const { pickIpv4, clientIp } = require('../src/services/clientIp');
  assert.equal(pickIpv4('::ffff:203.0.113.7'), '203.0.113.7');
  assert.equal(pickIpv4('2a02:587:1::1'), '');
  assert.equal(pickIpv4('2a02:587:1::1', '198.51.100.4'), '198.51.100.4');
  assert.equal(clientIp({ ips: ['2a02:587:1::1', '203.0.113.7'], ip: '2a02:587:1::1', headers: {} }), '203.0.113.7');
  assert.equal(clientIp({ ip: '::ffff:10.1.2.3', headers: {} }), '10.1.2.3');
  assert.equal(clientIp({ ip: '::1', headers: { 'x-forwarded-for': '2a02::1, 192.0.2.9' } }), '192.0.2.9');
  assert.equal(clientIp({ ip: '::1', headers: {} }), '');
});
