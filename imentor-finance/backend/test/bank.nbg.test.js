// The real NBG provider against a fake NBG server that enforces what the published
// "Aggregator Account Information API v1.1" spec requires (headers, body shape, flow).
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

let server, seen, tokenCalls, behaviour;

test.before(async () => {
  seen = []; tokenCalls = 0; behaviour = {};
  server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', c => raw += c);
    req.on('end', () => { try {
      const send = (status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
      if (req.url === '/token') {
        tokenCalls++;
        const f = new URLSearchParams(raw);
        assert.equal(f.get('grant_type'), 'client_credentials');
        assert.equal(f.get('scope'), 'sandbox-ais-aggregator-api-v1');
        assert.equal(f.get('client_id'), 'cid'); assert.equal(f.get('client_secret'), 'sec');
        return send(200, { access_token: `tok${tokenCalls}`, expires_in: 3600 });
      }
      const body = raw ? JSON.parse(raw) : {};
      const h = req.headers;
      const path = req.url.replace('/api', '');
      seen.push({ path, h, body });
      if (req.method === 'GET' && path.startsWith('/sandbox/')) return behaviour.noSandbox ? send(404, { exception: { code: 'NBG-S-006', desc: 'Sandbox Not Found' } }) : send(200, { payload: { sandboxId: 'sbx1' } });
      // everything the spec marks as required on every call
      if (behaviour.force401 && !behaviour.did401) { behaviour.did401 = true; return send(401, {}); }
      assert.match(h.authorization, /^Bearer tok\d+$/);
      if (!path.startsWith('/sandbox')) assert.equal(h['sandbox_id'], 'sbx1');
      assert.equal(h['client-id'], 'cid');
      assert.equal(h['x-client-user-id'], 'imentor-finance');
      assert.ok(h['x-fapi-interaction-id']);
      assert.equal(body.header.ID, h['x-fapi-interaction-id'], 'header.ID must equal X-Fapi-Interaction-Id');
      assert.equal(body.header.application, 'cid');
      if (behaviour.apiError) return send(403, { exception: { code: 'E123', desc: 'Consent has expired', sev: 'Error' } });

      if (path === '/client/connections') return send(200, { payload: [
        { country: 'GR', displayName: 'National Bank of Greece', bankBIC: 'ETHNGRAA', capabilities: { 'AIS-Bank-Account-Transactions': true } },
        { country: 'GR', displayName: 'Alpha Bank', bankBIC: 'CRBAGRAA', capabilities: { 'AIS-Bank-Account-Transactions': true } },
        { country: 'GR', displayName: 'Eurobank', bankBIC: 'EFGBGRAA', capabilities: { 'AIS-Bank-Account-Transactions': false } } ] });
      if (path === '/sandbox') {
        assert.equal(h['sandbox_id'], undefined, 'spec: no Sandbox_Id header on create');
        if (behaviour.sandboxExists) return send(400, { exception: { code: 'NBG-S-002', desc: 'Sandbox with the same sandboxId already exists!' } });
        if (behaviour.sandboxStringPayload && typeof body.payload !== 'string') return send(400, { exception: { code: 'NBG-S-010', desc: 'Invalid Request: You must fill all the required fields in the request body.' } });
        if (!behaviour.sandboxStringPayload) assert.deepEqual(body.payload, { sandbox_Id: 'sbx1' });
        return send(200, { payload: { sandboxId: 'sbx1' } });
      }
      if (path === '/user/connections/add' && !/^[A-Za-z0-9_-]+$/.test(body.payload.State || '')) return send(400, { exception: { code: 'NBG-A-418', desc: 'Invalid Request: The field State accepts alpha-numeric characters, as well as dashes and underscores', sev: 'Error' } });
      if (path === '/user/connections/add') return send(200, { payload: { connectionLink: 'https://bank.example/login?x=1', connectionId: 'conn-1', bankBIC: h['x-subject-bank-bic'], country: 'GR', displayName: 'X' } });
      if (path === '/user/connections') return send(200, { payload: { clientUserId: 'imentor-finance', banks: behaviour.banks } });
      if (path === '/user/connections/update-sca-status') return send(200, { payload: { clientUserId: 'u', banks: [{ connectionId: body.payload.ConnectionId, bankBIC: h['x-subject-bank-bic'], status: 'Connected', validUntil: '2027-05-20' }] } });
      if (path === '/account/list') return send(200, { payload: [{ resourceId: 'R1', iban: 'GR0000000000000000000000001', account: '1', currency: 'EUR', availableBalance: 1 }, { resourceId: 'R2', iban: 'GR0000000000000000000000002', account: '2', currency: 'EUR', availableBalance: 2 }] });
      if (path === '/account/transactionsPaged') {
        const p = body.payload;
        assert.equal(p.bookingStatus, 'booked');
        if (p.resourceId === 'R2') return send(200, { payload: { data: [], paginationToken: '' } });
        if (!p.paginationData) return send(200, { payload: { paginationToken: 'PAGE2', data: [
          { date: '2026-11-25', timestamp: '2026-11-25T10:00:00.100Z', amount: 1234.5, currency: 'EUR', creditDebit: 'Credit', description: 'ΤΙΜ 55', relatedName: 'ACME ΑΕ', relatedAccount: 'GR99', reference: 'REF1' },
          { date: '2026-11-25', timestamp: '2026-11-25T11:00:00.000Z', amount: 20, currency: 'EUR', creditDebit: 'Debit', transDescription: 'Χρέωση', reference: 'REF2' },
          { date: '2026-11-24', timestamp: '2026-11-24T09:00:00.000Z', amount: 0, creditDebit: 'Credit', description: 'zero' },
        ] } });
        assert.deepEqual(p.paginationData, { paginationToken: 'PAGE2', pageCount: 1 });
        return send(200, { payload: { data: [{ date: '2026-11-23', timestamp: '2026-11-23T08:00:00.000Z', amount: -99.9, currency: 'EUR', description: 'signed amount, no creditDebit', reference: 'REF3' }], paginationToken: '' } });
      }
      send(404, { exception: { desc: `unexpected ${path}` } });
    } catch (e) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ exception: { desc: `FAKE SERVER ASSERTION: ${e.message}` } })); } });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  Object.assign(process.env, {
    NBG_ENV: 'sandbox', NBG_CLIENT_ID: 'cid', NBG_CLIENT_SECRET: 'sec', NBG_SANDBOX_ID: 'sbx1',
    NBG_TOKEN_URL: `http://127.0.0.1:${port}/token`, NBG_BASE_URL: `http://127.0.0.1:${port}/api`,
  });
});
test.after(() => server.close());

const P = () => require('../src/services/bankProviders/nbgAggregator');

test('configuration: sandbox needs a Sandbox_Id; production does not', () => {
  assert.equal(P().isConfigured(), true);
  const keep = process.env.NBG_SANDBOX_ID; delete process.env.NBG_SANDBOX_ID;
  assert.equal(P().isConfigured(), false);
  process.env.NBG_ENV = 'production'; assert.equal(P().isConfigured(), true);
  process.env.NBG_ENV = 'sandbox'; process.env.NBG_SANDBOX_ID = keep;
});

test('start consent: right BIC, customer IPv4 unwrapped, callback + state sent; token requested once', async () => {
  P()._internals.resetTokenCache(); tokenCalls = 0;
  const r = await P().startConsent({ bank: 'alpha', redirectUri: 'https://finance.example/api/bank/callback', state: 'S1', psuIp: '::ffff:203.0.113.7' });
  assert.deepEqual(r, { redirectUrl: 'https://bank.example/login?x=1', consentId: 'conn-1' });
  const c = seen.at(-1);
  assert.equal(c.h['x-subject-bank-bic'], 'CRBAGRAA');
  assert.equal(c.h['x-fapi-customer-ip-address'], '203.0.113.7');
  assert.deepEqual(c.body.payload, { CallBackUrl: 'https://finance.example/api/bank/callback', State: 'S1' });
  await P().startConsent({ bank: 'nbg', redirectUri: 'x', state: 'S2', psuIp: '::1' });   // IPv6 → not sent
  assert.equal(seen.at(-1).h['x-fapi-customer-ip-address'], undefined);
  assert.equal(seen.at(-1).h['x-subject-bank-bic'], 'ETHNGRAA');
  assert.equal(tokenCalls, 1, 'the access token is cached between calls');
});

test('consent status: Connected → active with validUntil; PendingSCAData SMS → pending; AccessDenied → error', async () => {
  const conn = { bank: 'piraeus', consent_id: 'c9' };
  behaviour.banks = [{ connectionId: 'c9', bankBIC: 'PIRBGRAA', status: 'Connected', validUntil: '2027-05-20' }];
  const ok = await P().completeConsent({ connection: conn, query: { connectionId: 'c9' } });
  assert.equal(ok.status, 'active'); assert.equal(ok.expiresAt.toISOString().slice(0, 10), '2027-05-20');
  behaviour.banks = [{ connectionId: 'c9', bankBIC: 'PIRBGRAA', status: 'PendingSCAData', scaType: 'SMS' }];
  const pend = await P().completeConsent({ connection: conn, query: {} });
  assert.equal(pend.status, 'pending'); assert.equal(pend.scaType, 'SMS');
  assert.deepEqual(seen.at(-1).body.payload, { connectionId: 'c9' });
  behaviour.banks = [{ connectionId: 'c9', bankBIC: 'PIRBGRAA', status: 'AccessDenied' }];
  await assert.rejects(P().completeConsent({ connection: conn, query: {} }), /AccessDenied/);
});

test('SMS OTP is sent to update-sca-status for the right connection and bank', async () => {
  const r = await P().submitOtp({ connection: { bank: 'piraeus', consent_id: 'c9' }, otp: '123456' });
  assert.equal(r.status, 'active');
  const c = seen.at(-1);
  assert.equal(c.path, '/user/connections/update-sca-status');
  assert.equal(c.h['x-subject-bank-bic'], 'PIRBGRAA');
  assert.deepEqual(c.body.payload, { ConnectionId: 'c9', OTP: '123456' });
});

test('transactions: all accounts, pagination followed, signs and ids mapped, zero amounts skipped', async () => {
  const rows = await P().fetchTransactions({ connection: { bank: 'nbg' }, from: '2026-11-01', to: '2026-11-26', psuIp: '198.51.100.4' });
  assert.equal(rows.length, 3);
  const [credit, debit, signed] = rows;
  assert.equal(credit.cents, 123450); assert.equal(credit.tx_date, '2026-11-25');
  assert.equal(credit.counterparty, 'ACME ΑΕ'); assert.equal(credit.counterparty_account, 'GR99');
  assert.equal(credit.account, 'GR0000000000000000000000001'); assert.equal(credit.description, 'ΤΙΜ 55');
  assert.equal(debit.cents, -2000); assert.equal(debit.description, 'Χρέωση');
  assert.equal(signed.cents, -9990);
  assert.ok(credit.external_id.includes('R1|REF1|') && new Set(rows.map(r => r.external_id)).size === 3);
  const first = seen.filter(s => s.path === '/account/transactionsPaged')[0].body.payload;
  assert.deepEqual([first.dateFrom, first.dateTo], ['2026-11-01', '2026-11-26']);
});

test('an expired token (401) is refreshed once and the call retried', async () => {
  tokenCalls = 0; behaviour = { force401: true };
  await P().startConsent({ bank: 'alpha', redirectUri: 'x', state: 's' });
  assert.equal(tokenCalls >= 1, true);
  behaviour = {};
});

test('API errors surface the bank message; consent problems become CONSENT_EXPIRED', async () => {
  behaviour = { apiError: true };
  await assert.rejects(P().fetchTransactions({ connection: { bank: 'alpha' }, from: 'a', to: 'b' }), e => e.code === 'CONSENT_EXPIRED' && /Consent has expired/.test(e.message));
  await assert.rejects(P().startConsent({ bank: 'alpha', redirectUri: 'x', state: 's' }), /Consent has expired \(E123\)/);
  behaviour = {};
});

test('BIC map can be overridden from the environment', () => {
  process.env.NBG_BANK_BICS = '{"eurobank":"EFGBGRAA"}';
  assert.equal(P()._internals.bics().eurobank, 'EFGBGRAA');
  assert.equal(P()._internals.bics().alpha, 'CRBAGRAA');
  delete process.env.NBG_BANK_BICS;
});

test('diagnose: lists NBG banks and flags which of our BICs are not offered', async () => {
  const d = await P().diagnose();
  assert.equal(d.env, 'sandbox');
  assert.deepEqual(d.banks.map(b => b.bic), ['ETHNGRAA', 'CRBAGRAA', 'EFGBGRAA']);
  assert.equal(d.mapping.nbg.available, true);
  assert.equal(d.mapping.alpha.available, true);
  assert.equal(d.mapping.piraeus.available, false);                   // not in the fake list
  assert.equal(d.mapping.eurobank.available, false);                  // our default ERBKGRAA differs from the fake EFGBGRAA
});

test('create sandbox follows the published contract; retries a plain-string payload; "already exists" is fine', async () => {
  const r = await P().createSandbox();
  assert.equal(r.sandboxId, 'sbx1');
  assert.equal(seen.at(-1).path, '/sandbox');
  behaviour = { sandboxStringPayload: true };
  assert.equal((await P().createSandbox()).sandboxId, 'sbx1');          // object rejected (S-010) → string accepted
  behaviour = { sandboxExists: true };
  assert.equal((await P().createSandbox()).alreadyExisted, true);       // S-002 is success for us
  behaviour = {};
});

test('diagnose reports whether the sandbox exists (the NBG-S-006 case)', async () => {
  behaviour = { noSandbox: true };
  assert.equal((await P().diagnose()).sandbox.exists, false);
  behaviour = {};
  const d = await P().diagnose();
  assert.deepEqual(d.sandbox, { id: 'sbx1', exists: true });
});

test('the real signed state is accepted by NBG (regression for NBG-A-418)', async () => {
  const { signState } = require('../src/services/bankState');
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
  const r = await P().startConsent({ bank: 'alpha', redirectUri: 'https://finance.example/api/bank/callback', state: signState(7) });
  assert.equal(r.consentId, 'conn-1');
  await assert.rejects(P().startConsent({ bank: 'alpha', redirectUri: 'x', state: 'a.b.c' }), /NBG-A-418/);   // a dotted (JWT-style) state is what broke it
});
