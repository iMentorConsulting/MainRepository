// NBG "Account Aggregation Platform" (one consent per bank: NBG, Alpha, Eurobank, Piraeus).
// STATUS: waiting for NBG's sandbox specification. The shape below is final; only the three HTTP
// calls are missing. Credentials go in Railway variables, never in code:
//   NBG_BASE_URL, NBG_CLIENT_ID, NBG_CLIENT_SECRET
const { ProviderNotReadyError } = require('./index');

const NOT_READY = 'Η διασύνδεση με το NBG Account Aggregation API δεν έχει ολοκληρωθεί ακόμα (αναμένεται η τεκμηρίωση sandbox).';

module.exports = {
  name: 'nbg',
  banks: ['nbg', 'alpha', 'piraeus', 'eurobank'],
  isConfigured: () => !!(process.env.NBG_BASE_URL && process.env.NBG_CLIENT_ID && process.env.NBG_CLIENT_SECRET),
  async startConsent()      { throw new ProviderNotReadyError(NOT_READY); },
  async completeConsent()   { throw new ProviderNotReadyError(NOT_READY); },
  async fetchTransactions() { throw new ProviderNotReadyError(NOT_READY); },
};
