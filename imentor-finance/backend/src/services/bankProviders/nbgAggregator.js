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
const { pickIpv4 } = require('../clientIp');

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
const ipv4 = (ip, fallback) => pickIpv4(ip, fallback);

// Last resort for background runs with no known customer IP: this server's own public IPv4 (cached 6 h).
// Set NBG_PSU_IP to pin it (recommended: your office's public IPv4), NBG_IP_LOOKUP=false to disable the lookup,
// or NBG_IP_LOOKUP_URL (comma-separated) to change the services asked.
let serverIpCache = { ip: '', exp: 0 };
async function serverIpv4() {
  if (process.env.NBG_IP_LOOKUP === 'false') return '';
  if (serverIpCache.exp > Date.now()) return serverIpCache.ip;
  const urls = (process.env.NBG_IP_LOOKUP_URL || 'https://api4.ipify.org,https://ipv4.icanhazip.com').split(',').map(x => x.trim()).filter(Boolean);
  let ip = '';
  for (const u of urls) {
    try { ip = pickIpv4((await (await fetch(u, { signal: AbortSignal.timeout(4000) })).text()).trim()); } catch { ip = ''; }
    if (ip) break;
  }
  serverIpCache = { ip, exp: Date.now() + (ip ? 6 * 3600e3 : 60e3) };
  return ip;
}

// Which IPv4 will be sent, and why (shown by "Έλεγχος σύνδεσης NBG")
async function resolveCustomerIp(ip) {
  const c = cfg();
  const own = pickIpv4(ip);               if (own) return { ip: own, source: 'αίτημα του χρήστη' };
  const pinned = pickIpv4(c.fixedIp);     if (pinned) return { ip: pinned, source: 'NBG_PSU_IP' };
  const found = await serverIpv4();       if (found) return { ip: found, source: 'δημόσια IP του server' };
  return { ip: '', source: 'ΔΕΝ βρέθηκε IPv4: ορίστε NBG_PSU_IP στο Railway' };
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

async function call(path, { bank, payload = {}, ip = '', retry = true, method = 'POST', sandboxHeader = true } = {}) {
  const c = cfg();
  const id = crypto.randomUUID();
  const headers = {
    Authorization: `Bearer ${await getToken()}`,
    'Client-Id': c.clientId,
    Accept: 'application/json',
    'X-Fapi-Interaction-Id': id,
    'X-Client-User-Id': c.clientUserId,
  };
  if (method !== 'GET') headers['Content-Type'] = 'application/json';
  const cip = (await resolveCustomerIp(ip)).ip;
  if (cip) headers['X-Fapi-Customer-Ip-Address'] = cip;
  if (bank) headers['X-Subject-Bank-Bic'] = bicOf(bank);
  if (c.env === 'sandbox' && c.sandboxId && sandboxHeader) headers['Sandbox_Id'] = c.sandboxId;

  const res = await fetch(c.base + path, {
    method, headers,
    ...(method === 'GET' ? {} : { body: JSON.stringify({ header: { ID: id, application: c.clientId }, payload }) }),
  });
  if (res.status === 401 && retry) { await getToken(true); return call(path, { bank, payload, ip, retry: false, method, sandboxHeader }); }
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
  env: () => cfg().env,
  key: () => `nbg:${cfg().env}`,           // sandbox and production consents are separate rows
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
    const r = consentResult(p, connectionId, bicOf(connection.bank));
    // Spec: update-sca-status moves "Pending PSU SCA Data" → "Connected". Banks that need no SMS code (e.g. Alpha)
    // are finished by calling it without an OTP; banks that want an SMS (Piraeus) wait for the user's code.
    if (r.status === 'pending' && !r.scaType && /PendingSCAData/.test(JSON.stringify((p.banks || []).find(x => x.connectionId === r.consentId) || {}))) {
      try {
        const p2 = await call('/user/connections/update-sca-status', { bank: connection.bank, ip: psuIp, payload: { ConnectionId: r.consentId } });
        return consentResult(p2, r.consentId, bicOf(connection.bank));
      } catch (e) {
        // NBG-A-204 "Missing OTP": this bank (Piraeus in the sandbox) did not announce scaType=SMS but does want the code
        if (e.apiCode === 'NBG-A-204' || /Missing OTP/i.test(e.message)) return { ...r, status: 'pending', scaType: 'SMS' };
        throw e;
      }
    }
    return r;
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
  // One-click health check for the UI: token OK? which banks can we connect to? do our BICs match?
  async diagnose({ psuIp = '' } = {}) {
    const customerIp = await resolveCustomerIp(psuIp);
    const banks = (await call('/client/connections')) || [];
    const want = bics();
    const sandbox = cfg().env === 'sandbox' ? { id: cfg().sandboxId, exists: await module.exports.sandboxExists().catch(() => null) } : null;
    return {
      env: cfg().env,
      customerIp,
      sandbox,
      banks: banks.map(b => ({ name: b.displayName, bic: b.bankBIC, country: b.country, transactions: !!b.capabilities?.['AIS-Bank-Account-Transactions'] })),
      mapping: Object.fromEntries(Object.entries(want).map(([k, bic]) => [k, { bic, available: banks.some(b => b.bankBIC === bic) }])),
    };
  },
  // Spec (POST /sandbox): body { header, payload: { sandbox_Id } }; no Sandbox_Id header on this call.
  // "A Sandbox with default data is created" - if the payload is rejected as malformed we retry with a plain string.
  async createSandbox() {
    const c = cfg();
    const opts = { sandboxHeader: false };
    try {
      return await call('/sandbox', { ...opts, payload: { sandbox_Id: c.sandboxId } });
    } catch (e) {
      if (e.apiCode === 'NBG-S-002') return { sandboxId: c.sandboxId, alreadyExisted: true };
      if (!['NBG-S-010', 'NBG-S-150'].includes(e.apiCode) && e.status !== 400) throw e;
      try { return await call('/sandbox', { ...opts, payload: c.sandboxId }); }
      catch (e2) { if (e2.apiCode === 'NBG-S-002') return { sandboxId: c.sandboxId, alreadyExisted: true }; throw e2; }
    }
  },
  // Read-only look at what the bank API returns (nothing is stored): accounts, balances, transaction count/date range.
  async probe({ bank, from, to, psuIp }) {
    const accounts = (await call('/account/list', { bank, ip: psuIp })) || [];
    const rows = await module.exports.fetchTransactions({ connection: { bank }, from, to, psuIp });
    const dates = rows.map(r => r.tx_date).sort();
    return {
      accounts: accounts.map(a => ({ iban: a.iban, currency: a.currency, balance: a.availableBalance })),
      transactions: {
        count: rows.length, credits: rows.filter(r => r.cents > 0).length, debits: rows.filter(r => r.cents < 0).length,
        from: dates[0] || null, to: dates.at(-1) || null,
        sample: rows.slice(0, 3).map(r => ({ date: r.tx_date, cents: r.cents, description: r.description, counterparty: r.counterparty })),
      },
      window: { from, to },
    };
  },
  async sandboxExists() {
    try { await call(`/sandbox/${encodeURIComponent(cfg().sandboxId)}`, { method: 'GET', sandboxHeader: false }); return true; }
    catch (e) { if (e.apiCode === 'NBG-S-006' || e.apiCode === 'NBG-S-001') return false; throw e; }
  },
  _internals: { cfg, bics, ipv4, call, getToken, consentResult, resetTokenCache: () => { tokenCache = { token: '', exp: 0, key: '' }; serverIpCache = { ip: '', exp: 0 }; } },
};
module.exports.NbgApiError = NbgApiError;
