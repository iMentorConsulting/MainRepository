// NBG "Account Aggregation Platform" – Aggregator Account Information API v1.1
// (one consent per bank: NBG, Alpha, Eurobank, Piraeus; read-only).
//
// Auth:    OAuth2 client-credentials token (my.nbg.gr) + `Client-Id` header.
// Calls:   POST JSON { header: { ID, application }, payload } with headers
//          X-Fapi-Interaction-Id (uuid, == header.ID), X-Client-User-Id, X-Fapi-Customer-Ip-Address,
//          X-Subject-Bank-Bic (per bank), Sandbox_Id (sandbox only).
// Flow:    /user/connections/add  → connectionLink (user logs in at the bank) → callback →
//          /user/connections (status Connected | PendingSCAData | Processing | AccessDenied, validUntil) →
//          [Piraeus SMS: /user/connections/update-sca-status with the OTP] →
//          /account/list → /account/transactionsPaged.
//
// Railway variables:  NBG_CLIENT_ID, NBG_CLIENT_SECRET            (required)
//                     NBG_ENV=sandbox|production  (default sandbox), NBG_SANDBOX_ID (sandbox only)
//                     NBG_CLIENT_USER_ID (default "imentor-finance"), NBG_PSU_IP (fallback customer IPv4)
//                     NBG_BANK_BICS='{"alpha":"…"}' to override the default BICs, NBG_BASE_URL / NBG_TOKEN_URL (tests)
const crypto = require('crypto');

const DEFAULT_BICS = { nbg: 'ETHNGRAA', alpha: 'CRBAGRAA', piraeus: 'PIRBGRAA', eurobank: 'ERBKGRAA' }; // verify with `npm run nbg:banks`
const URLS = {
  sandbox:    'https://apis.nbg.gr/sandbox/aggregator.ais/oauth2/v1.1',
  production: 'https://services.nbg.gr/apis/aggregator/ais/v1',
};
const SCOPES = { sandbox: 'sandbox-ais-aggregator-api-v1', production: 'ais-aggregator-api-v1' };
const DEFAULT_TOKEN_URL = 'https://my.nbg.gr/identity/connect/token';

class NbgApiError extends Error {
  constructor(message, { status, code } = {}) { super(message); this.status = status; this.apiCode = code; }
}

const cfg = () => {
  const env = process.env.NBG_ENV === 'production' ? 'production' : 'sandbox';
  return {
    env,
    base: (process.env.NBG_BASE_URL || URLS[env]).replace(/\/$/, ''),
    tokenUrl: process.env.NBG_TOKEN_URL || DEFAULT_TOKEN_URL,
    scope: SCOPES[env],
    clientId: process.env.NBG_CLIENT_ID || '',
    clientSecret: process.env.NBG_CLIENT_SECRET || '',
    sandboxId: process.env.NBG_SANDBOX_ID || '',
    clientUserId: process.env.NBG_CLIENT_USER_ID || 'imentor-finance',
    fixedIp: process.env.NBG_PSU_IP || '',
  };
};

const bics = () => ({ ...DEFAULT_BICS, ...(process.env.NBG_BANK_BICS ? JSON.parse(process.env.NBG_BANK_BICS) : {}) });
const bicOf = bank => { const b = bics()[bank]; if (!b) throw new Error(`Άγνωστη τράπεζα: ${bank}`); return b; };

// the API wants the customer's IPv4: unwrap ::ffff:1.2.3.4, ignore real IPv6, fall back to NBG_PSU_IP
function ipv4(ip, fallback) {
  const m = String(ip || '').replace(/^::ffff:/, '').match(/^\d{1,3}(\.\d{1,3}){3}$/);
  return m ? m[0] : (fallback || '');
}

let tokenCache = { token: '', exp: 0, key: '' };

async function getToken(force = false) {
  const c = cfg();
  const key = `${c.tokenUrl}|${c.clientId}|${c.scope}`;
  if (!force && tokenCache.key === key && tokenCache.exp > Date.now() + 60_000) return tokenCache.token;
  const res = await fetch(c.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, grant_type: 'client_credentials', scope: c.scope }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new NbgApiError(`NBG token: ${data.error_description || data.error || res.status}`, { status: res.status });
  tokenCache = { token: data.access_token, exp: Date.now() + (Number(data.expires_in) || 3600) * 1000, key };
  return tokenCache.token;
}

async function call(path, { bank, payload = {}, ip = '', retry = true } = {}) {
  const c = cfg();
  const id = crypto.randomUUID();
  const headers = {
    Authorization: `Bearer ${await getToken()}`,
    'Client-Id': c.clientId,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Fapi-Interaction-Id': id,
    'X-Client-User-Id': c.clientUserId,
  };
  const cip = ipv4(ip, c.fixedIp);
  if (cip) headers['X-Fapi-Customer-Ip-Address'] = cip;
  if (bank) headers['X-Subject-Bank-Bic'] = bicOf(bank);
  if (c.env === 'sandbox' && c.sandboxId) headers['Sandbox_Id'] = c.sandboxId;

  const res = await fetch(c.base + path, { method: 'POST', headers, body: JSON.stringify({ header: { ID: id, application: c.clientId }, payload }) });
  if (res.status === 401 && retry) { await getToken(true); return call(path, { bank, payload, ip, retry: false }); }
  const data = await res.json().catch(() => ({}));
  const ex = data.exception;
  if (!res.ok || ex) {
    const desc = ex?.desc || data.message || data.error || `HTTP ${res.status}`;
    throw new NbgApiError(`NBG ${path}: ${desc}${ex?.code ? ` (${ex.code})` : ''}`, { status: res.status, code: ex?.code });
  }
  return data.payload;
}

// Normalise a BankConnection from /user/connections into our consent result
function consentResult(payload, connectionId, bic) {
  const banks = payload?.banks || [];
  const b = banks.find(x => x.connectionId === connectionId) || banks.find(x => x.bankBIC === bic);
  if (!b) throw new NbgApiError('NBG: δεν βρέθηκε η σύνδεση τράπεζας στην απάντηση.');
  if (b.status === 'AccessDenied') throw new NbgApiError('Η τράπεζα δεν έδωσε πρόσβαση (AccessDenied).');
  const connected = b.status === 'Connected';
  return {
    consentId: b.connectionId,
    status: connected ? 'active' : 'pending',               // PendingSCAData / Processing
    scaType: b.scaType || '',
    expiresAt: b.validUntil ? new Date(`${b.validUntil}T23:59:59Z`) : (connected ? new Date(Date.now() + 180 * 86400000) : null),
  };
}

const isConsentError = e => /consent|expired|connection.*(invalid|not found)|SCA/i.test(e.message) && [400, 401, 403].includes(e.status);

module.exports = {
  name: 'nbg',
  banks: ['nbg', 'alpha', 'piraeus', 'eurobank'],
  isConfigured() {
    const c = cfg();
    return !!(c.clientId && c.clientSecret && (c.env === 'production' || c.sandboxId));
  },

  // 1) bank login URL for the user
  async startConsent({ bank, redirectUri, state, psuIp }) {
    const p = await call('/user/connections/add', { bank, ip: psuIp, payload: { CallBackUrl: redirectUri, State: state } });
    return { redirectUrl: p.connectionLink, consentId: p.connectionId };
  },

  // 2) after the user returns (or to re-check a pending connection): what is the status now?
  async completeConsent({ connection, query = {}, psuIp }) {
    const connectionId = query.connectionId || connection.consent_id;
    const p = await call('/user/connections', { ip: psuIp, payload: connectionId ? { connectionId } : {} });
    return consentResult(p, connectionId, bicOf(connection.bank));
  },

  // 2b) Piraeus (and any bank that asks for an SMS OTP)
  async submitOtp({ connection, otp, psuIp }) {
    const p = await call('/user/connections/update-sca-status', { bank: connection.bank, ip: psuIp, payload: { ConnectionId: connection.consent_id, OTP: String(otp) } });
    return consentResult(p, connection.consent_id, bicOf(connection.bank));
  },

  // 3) accounts → paginated booked transactions → rows for ingest()
  async fetchTransactions({ connection, from, to, psuIp }) {
    const { ConsentExpiredError } = require('./index');
    try {
      const accounts = await call('/account/list', { bank: connection.bank, ip: psuIp }) || [];
      const rows = [];
      for (const acc of accounts) {
        let token = '';
        for (let page = 0; page < 200; page++) {
          const payload = { resourceId: acc.resourceId, dateFrom: from, dateTo: to, bookingStatus: 'booked' };
          if (token) payload.paginationData = { paginationToken: token, pageCount: 1 };
          const r = await call('/account/transactionsPaged', { bank: connection.bank, ip: psuIp, payload });
          for (const t of r?.data || []) {
            const abs = Math.round(Math.abs(Number(t.amount)) * 100);
            const cents = t.creditDebit === 'Debit' ? -abs : t.creditDebit === 'Credit' ? abs : Math.round(Number(t.amount) * 100);
            if (!abs) continue;
            rows.push({
              tx_date: String(t.date || t.timestamp).slice(0, 10),
              cents,
              description: t.description || t.transDescription || '',
              counterparty: t.relatedName || '',
              counterparty_account: t.relatedAccount || '',
              account: acc.iban || acc.account || '',
              external_id: `${acc.resourceId}|${t.reference || ''}|${t.timestamp || t.date}|${cents}`,
            });
          }
          if (!r?.paginationToken || r.paginationToken === token) break;
          token = r.paginationToken;
        }
      }
      return rows;
    } catch (e) {
      if (e instanceof NbgApiError && isConsentError(e)) throw new ConsentExpiredError(e.message);
      throw e;
    }
  },

  // ── helpers for scripts/ (npm run nbg:banks | nbg:sandbox) ─────────────────────────────────
  async listBanks() { return call('/client/connections'); },
  async createSandbox() {
    const c = cfg();
    return call('/sandbox', { payload: { sandboxId: c.sandboxId, requireNbgConsent: false, showCompletionPage: false, consentApplicationIds: [c.clientId] } });
  },
  _internals: { cfg, bics, ipv4, call, getToken, consentResult, resetTokenCache: () => { tokenCache = { token: '', exp: 0, key: '' }; } },
};
module.exports.NbgApiError = NbgApiError;
