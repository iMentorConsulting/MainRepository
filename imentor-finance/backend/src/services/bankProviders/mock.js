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
  banks: ['nbg', 'alpha', 'piraeus', 'eurobank'],
  isConfigured: () => true,

  async startConsent({ bank, redirectUri, state }) {
    const q = new URLSearchParams({ state, mock_consent: `mock-${bank}` });
    return { redirectUrl: `${redirectUri}?${q}`, consentId: `mock-${bank}` };
  },

  async completeConsent({ connection, query }) {
    return { consentId: query.mock_consent || connection.consent_id, expiresAt: new Date(Date.now() + 180 * 86400000) };
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
