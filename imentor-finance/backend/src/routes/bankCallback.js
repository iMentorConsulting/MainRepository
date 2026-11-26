// Where the bank sends the user's browser back after they approve access.
// PUBLIC route (the redirect carries no login token); it is protected by a signed, short-lived `state`.
const router = require('express').Router();
const { verifyState } = require('../services/bankState');
const BankConnection = require('../models/BankConnection');
const { getProvider } = require('../services/bankProviders');
const { syncConnection } = require('../services/bankSync');

const back = (res, qs) => res.redirect(`/bank?${new URLSearchParams(qs)}`);

router.get('/', async (req, res) => {
  let claims;
  try {
    claims = verifyState(req.query.state);
  } catch {
    return back(res, { bank_error: 'Μη έγκυρη ή ληγμένη αίτηση σύνδεσης. Δοκιμάστε ξανά.' });
  }
  try {
    const conn = await BankConnection.findByPk(claims.cid);
    if (!conn) throw new Error('Άγνωστη σύνδεση');
    if (req.query.error) throw new Error(`Η τράπεζα απέρριψε την πρόσβαση (${req.query.error})`);
    const { consentId, expiresAt } = await getProvider().completeConsent({ connection: conn, query: req.query });
    await conn.update({ status: 'active', consent_id: consentId, consent_expires_at: expiresAt, last_error: '' });
    syncConnection(conn, { psuIp: req.ip }).catch(e => console.warn('[bank-callback] first sync failed:', e.message)); // initial history, don't block the redirect
    back(res, { bank_connected: conn.bank });
  } catch (e) {
    back(res, { bank_error: e.message });
  }
});

module.exports = router;
