// Fake bank for development and tests (BANK_PROVIDER=mock). Generates deterministic transactions
// so the whole flow (consent redirect -> sync -> alert -> UI) can be exercised without NBG.
const crypto = require('crypto');

const NAMES = ['ACME ΑΕ', 'ΠΑΠΑΔΟΠΟΥΛΟΣ ΓΕΩΡΓΙΟΣ', 'ΑΛΦΑ ΕΠΕ', 'ΒΗΤΑ ΙΚΕ'];

function* days(from, to) {
  for (let d = new Date(from + 'T00:00:00Z'); d <= new Date(to + 'T00:00:00Z'); d = new Date(d.getTime() + 86400000)) yield d.toISOString().slice(0, 10);
}
const h = s => parseInt(crypto.createHash('sha1').update(s).digest('hex').slice(0, 8), 16);

module.exports = {
  name: 'mock',
  env: () => 'mock',
  key: () => 'mock',
  banks: ['nbg', 'alpha', 'piraeus', 'eurobank'],
  isConfigured: () => true,
  async diagnose() {
    const banks = ['nbg', 'alpha', 'piraeus', 'eurobank'];
    return { env: 'mock', banks: banks.map(b => ({ name: b, bic: `MOCK-${b}`, country: 'GR', transactions: true })), mapping: Object.fromEntries(banks.map(b => [b, { bic: `MOCK-${b}`, available: true }])) };
  },
  async createSandbox() { return { sandboxId: 'mock' }; },
  async probe({ bank, from, to }) {
    const rows = await module.exports.fetchTransactions({ connection: { bank }, from, to });
    const dates = rows.map(r => r.tx_date).sort();
    return { accounts: [{ iban: `MOCK-${bank}`, currency: 'EUR', balance: 0 }], transactions: { count: rows.length, credits: rows.filter(r => r.cents > 0).length, debits: rows.filter(r => r.cents < 0).length, from: dates[0] || null, to: dates.at(-1) || null, sample: [] }, window: { from, to } };
  },

  async startConsent({ bank, redirectUri, state }) {
    if (process.env.MOCK_FAIL_START === 'true') throw new Error('NBG /user/connections/add: Sandbox Not Found (NBG-S-006)');
    const q = new URLSearchParams({ state, mock_consent: `mock-${bank}` });
    return { redirectUrl: `${redirectUri}?${q}`, consentId: `mock-${bank}` };
  },

  // Piraeus behaves like the real bank: SMS OTP required (accepted code: 123456)
  async completeConsent({ connection, query }) {
    const consentId = query.mock_consent || connection.consent_id;
    if (connection.bank === 'piraeus' && !global.__mockOtpDone?.has(consentId)) return { consentId, status: 'pending', scaType: 'SMS', expiresAt: null };
    return { consentId, status: 'active', scaType: '', expiresAt: new Date(Date.now() + 180 * 86400000) };
  },

  async submitOtp({ connection, otp }) {
    if (String(otp) !== '123456') throw new Error('Λάθος κωδικός OTP.');
    (global.__mockOtpDone = global.__mockOtpDone || new Set()).add(connection.consent_id);
    return { consentId: connection.consent_id, status: 'active', scaType: '', expiresAt: new Date(Date.now() + 180 * 86400000) };
  },

  async fetchTransactions({ connection, from, to }) {
    if (process.env.MOCK_EXPIRED === 'true') { const { ConsentExpiredError } = require('./index'); throw new ConsentExpiredError('mock consent expired'); }
    const out = [];
    for (const day of days(from, to)) {
      const x = h(`${connection.bank}|${day}`);
      if (x % 3 === 0) out.push({ tx_date: day, cents: 10000 + (x % 90000), description: `ΕΙΣΠΡΑΞΗ ΤΙΜ ${x % 900}`, counterparty: NAMES[x % NAMES.length], account: `MOCK-${connection.bank}`, external_id: `m-${connection.bank}-${day}-c` });
      if (x % 4 === 0) out.push({ tx_date: day, cents: -(2000 + (x % 30000)), description: x % 8 === 0 ? 'ΔΕΗ ΛΟΓΑΡΙΑΣΜΟΣ' : 'ΠΛΗΡΩΜΗ ΠΡΟΜΗΘΕΥΤΗ', counterparty: '', account: `MOCK-${connection.bank}`, external_id: `m-${connection.bank}-${day}-d` });
    }
    return out;
  },
};
