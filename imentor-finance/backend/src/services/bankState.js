// Signed `state` for the bank consent redirect.
// NBG only accepts letters, digits, "-" and "_" in State (error NBG-A-418), so this is NOT a JWT:
//   bc-<connectionId>-<expiry base36>-<24 hex of HMAC-SHA256>
// The key is DERIVED from JWT_SECRET, and the value is not a JWT, so it can never work as a login token.
const crypto = require('crypto');

const key = () => crypto.createHmac('sha256', process.env.JWT_SECRET || '').update('bank-consent-state').digest();
const mac = body => crypto.createHmac('sha256', key()).update(body).digest('hex').slice(0, 24);

function signState(cid, ttlMs = 20 * 60 * 1000, now = Date.now()) {
  const body = `bc-${Number(cid)}-${(now + ttlMs).toString(36)}`;
  return `${body}-${mac(body)}`;
}

function verifyState(token, now = Date.now()) {
  const m = String(token || '').match(/^(bc-(\d+)-([0-9a-z]+))-([0-9a-f]{24})$/);
  if (!m) throw new Error('bad state');
  const [, body, cid, exp, sig] = m;
  const ok = crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(mac(body)));
  if (!ok) throw new Error('bad state signature');
  if (parseInt(exp, 36) < now) throw new Error('state expired');
  return { cid: Number(cid) };
}

module.exports = { signState, verifyState };
