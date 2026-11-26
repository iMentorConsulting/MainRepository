// A "provider" is whatever delivers bank data: the NBG aggregator today, others later.
// Contract every provider implements:
//   name, banks[]                         which banks it can reach
//   isConfigured()                        credentials present?
//   startConsent({bank, redirectUri, state}) -> { redirectUrl, consentId? }
//   completeConsent({connection, query})     -> { consentId, expiresAt: Date }
//   fetchTransactions({connection, from, to, psuIp}) -> rows[]  { tx_date, cents, description,
//                                               counterparty, account, external_id? }
// Throw ConsentExpiredError from fetchTransactions when the bank says the consent is no longer valid.
// Errors carry a `code` so they are recognised even if a module is loaded twice (instanceof would fail).
class ConsentExpiredError extends Error { get code() { return 'CONSENT_EXPIRED'; } }
class ProviderNotReadyError extends Error { get code() { return 'PROVIDER_NOT_READY'; } }

const providers = {
  mock: () => require('./mock'),
  nbg:  () => require('./nbgAggregator'),
};

function getProvider() {
  const name = process.env.BANK_PROVIDER || 'nbg';
  if (!providers[name]) throw new Error(`Unknown BANK_PROVIDER "${name}"`);
  return providers[name]();
}

module.exports = { getProvider, ConsentExpiredError, ProviderNotReadyError };
