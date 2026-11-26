// Where the bank sends the user's browser back after they approve access.
// PUBLIC route (the redirect carries no login token); it is protected by a signed, short-lived `state`.
const router = require('express').Router();
const { verifyState } = require('../services/bankState');
const BankConnection = require('../models/BankConnection');
const { getProvider } = require('../services/bankProviders');
const { syncConnection, applyConsentResult } = require('../services/bankSync');

const back = (res, qs) => res.redirect(`/bank?${new URLSearchParams(qs)}`);

router.get('/', async (req, res) => {
  try {
    // Identify the connection by the signed `state`; if the bank does not echo it, fall back to the
    // connectionId it appends — harmless, because the status is always re-read from the bank's API.
    let conn = null;
    try { conn = await BankConnection.findByPk(verifyState(req.query.state).cid); } catch { /* try fallback */ }
    if (!conn && req.query.connectionId) conn = await BankConnection.findOne({ where: { consent_id: String(req.query.connectionId) } });
    if (!conn) return back(res, { bank_error: 'Μη έγκυρη ή ληγμένη αίτηση σύνδεσης. Δοκιμάστε ξανά.' });
    if (req.query.error) throw new Error(`Η τράπεζα απέρριψε την πρόσβαση (${req.query.error})`);

    const r = await getProvider().completeConsent({ connection: conn, query: req.query, psuIp: req.ip });
    await applyConsentResult(conn, r, req.ip);
    if (conn.status === 'active') {
      syncConnection(conn, { psuIp: req.ip }).catch(e => console.warn('[bank-callback] first sync failed:', e.message)); // initial history, don't block the redirect
      return back(res, { bank_connected: conn.bank });
    }
    back(res, { bank_pending: conn.bank });
  } catch (e) {
    back(res, { bank_error: e.message });
  }
});

module.exports = router;
