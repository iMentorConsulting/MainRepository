// Signed `state` for the bank consent redirect. It travels in URLs (browser history, logs), so it is
// signed with a key DERIVED from JWT_SECRET: it can never be accepted as a login token by authMiddleware.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const key = () => crypto.createHmac('sha256', process.env.JWT_SECRET || '').update('bank-consent-state').digest('hex');

const signState = cid => jwt.sign({ purpose: 'bank-consent', cid }, key(), { expiresIn: '20m' });

function verifyState(token) {
  const claims = jwt.verify(String(token || ''), key());
  if (claims.purpose !== 'bank-consent') throw new Error('wrong purpose');
  return claims;
}

module.exports = { signState, verifyState };
