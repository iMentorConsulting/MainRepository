process.env.DATABASE_URL = process.env.BANK_E2E_DATABASE_URL || process.env.DATABASE_URL || 'postgres://u:p@localhost:5432/unused';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.BANK_PROVIDER = 'mock';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { signState, verifyState } = require('../src/services/bankState');
const { syncWindow } = require('../src/services/bankSync');
const authMiddleware = require('../src/middleware/auth');

test('state token round-trips, expires, and is NOT accepted as a login token', () => {
  const state = signState(42);
  assert.equal(verifyState(state).cid, 42);
  assert.throws(() => verifyState('garbage'));
  // a normal login token must not work as consent state
  assert.throws(() => verifyState(jwt.sign({ purpose: 'bank-consent', cid: 1 }, process.env.JWT_SECRET)));
  // and the state must not authenticate API calls
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
