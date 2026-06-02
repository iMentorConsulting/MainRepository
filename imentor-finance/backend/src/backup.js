'use strict';
require('dotenv').config();

const crypto = require('crypto');
const https  = require('https');
const sequelize = require('./config/db');

// Models
require('./models/Income');
require('./models/Expense');
require('./models/Customer');
require('./models/ServiceAgreement');
require('./models/ListItem');
require('./models/RecurringExpense');
require('./models/CommissionLog');

const Income           = require('./models/Income');
const Expense          = require('./models/Expense');
const Customer         = require('./models/Customer');
const ServiceAgreement = require('./models/ServiceAgreement');
const ListItem         = require('./models/ListItem');
const RecurringExpense = require('./models/RecurringExpense');
const CommissionLog    = require('./models/CommissionLog');

const BACKUP_FOLDER_ID = process.env.GDRIVE_BACKUP_FOLDER_ID || '19FRqXOTePavaJ07CmKFTWF4aKKJTraE4';

function getServiceAccountKey() {
  const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const b64Key  = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const src = rawJson || b64Key;
  if (!src) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON (or GOOGLE_SERVICE_ACCOUNT_KEY) is not set in Railway env vars');
  // Strip surrounding whitespace + accidental single/double quotes (common Railway paste artifact)
  const stripped = src.trim().replace(/^'+|'+$/g, '').replace(/^"+|"+$/g, '');
  // Try direct JSON parse first, then base64-decode fallback
  try {
    return JSON.parse(stripped);
  } catch (e1) {
    try {
      return JSON.parse(Buffer.from(stripped, 'base64').toString('utf8'));
    } catch (e2) {
      throw new Error(`Service account key parse failed — direct: ${e1.message} | base64: ${e2.message}`);
    }
  }
}

// Same JWT-based token approach as gmail.js — proven to work with domain-wide delegation
async function getDriveAccessToken() {
  const key = getServiceAccountKey();
  const impersonateEmail = process.env.GDRIVE_IMPERSONATE_EMAIL || process.env.GMAIL_USER;
  if (!impersonateEmail) throw new Error('Set GDRIVE_IMPERSONATE_EMAIL or GMAIL_USER for Drive impersonation');

  const now = Math.floor(Date.now() / 1000);
  const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: key.client_email,
    sub: impersonateEmail,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })).toString('base64url');
  const toSign = `${header}.${payload}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(toSign);
  const signature = sign.sign(key.private_key, 'base64url');
  const jwt  = `${toSign}.${signature}`;
  const body = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`;

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        let data;
        try { data = JSON.parse(raw); } catch (e) {
          return reject(new Error(`Drive token response not JSON: ${raw.slice(0, 200)}`));
        }
        if (data.access_token) resolve(data.access_token);
        else reject(new Error(`Drive token error: ${JSON.stringify(data)}`));
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

function driveRequest(method, path, accessToken, bodyBuffer, contentType) {
  return new Promise((resolve, reject) => {
    const headers = { 'Authorization': `Bearer ${accessToken}` };
    if (contentType) headers['Content-Type'] = contentType;
    if (bodyBuffer) headers['Content-Length'] = bodyBuffer.length;
    const req = https.request({ hostname: 'www.googleapis.com', path, method, headers }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        let data; try { data = JSON.parse(text); } catch { data = text; }
        resolve({ status: res.statusCode, data });
      });
    });
    req.on('error', reject);
    if (bodyBuffer) req.end(bodyBuffer); else req.end();
  });
}

async function uploadToDrive(accessToken, filename, jsonContent) {
  const boundary = `bk_${Date.now()}`;
  const metadata = JSON.stringify({ name: filename, parents: [BACKUP_FOLDER_ID] });
  const body = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${jsonContent}\r\n` +
    `--${boundary}--`
  );
  const { status, data } = await driveRequest(
    'POST',
    '/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
    accessToken, body,
    `multipart/related; boundary=${boundary}`
  );
  if (status < 200 || status >= 300) throw new Error(`Drive upload ${status}: ${JSON.stringify(data)}`);
  return data;
}

async function pruneOldBackups(accessToken, keepCount = 30) {
  const q = encodeURIComponent(`'${BACKUP_FOLDER_ID}' in parents and trashed = false`);
  const { status, data } = await driveRequest(
    'GET',
    `/drive/v3/files?q=${q}&orderBy=createdTime+desc&fields=files(id,name)&pageSize=100`,
    accessToken
  );
  if (status !== 200) return 0;
  const toDelete = (data.files || []).slice(keepCount);
  for (const f of toDelete) {
    await driveRequest('DELETE', `/drive/v3/files/${f.id}`, accessToken).catch(() => {});
  }
  return toDelete.length;
}

async function exportAllData() {
  const [income, expenses, customers, agreements, listItems, recurring, commissions] = await Promise.all([
    Income.findAll({ raw: true }),
    Expense.findAll({ raw: true }),
    Customer.findAll({ raw: true }),
    ServiceAgreement.findAll({ raw: true }),
    ListItem.findAll({ raw: true }),
    RecurringExpense.findAll({ raw: true }),
    CommissionLog.findAll({ raw: true }),
  ]);
  return {
    exported_at: new Date().toISOString(),
    counts: {
      income: income.length, expenses: expenses.length, customers: customers.length,
      service_agreements: agreements.length, list_items: listItems.length,
      recurring_expenses: recurring.length, commission_logs: commissions.length,
    },
    income, expenses, customers, service_agreements: agreements,
    list_items: listItems, recurring_expenses: recurring, commission_logs: commissions,
  };
}

async function runBackup() {
  console.log('[backup] Starting database export…');
  await sequelize.authenticate();

  const data = await exportAllData();
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `imentor-finance-backup-${ts}.json`;
  const jsonContent = JSON.stringify(data, null, 2);

  let driveFile = null;
  let pruned = 0;
  let driveError = null;

  try {
    const accessToken = await getDriveAccessToken();
    driveFile = await uploadToDrive(accessToken, filename, jsonContent);
    pruned = await pruneOldBackups(accessToken);
    console.log(`[backup] Uploaded to Drive: ${driveFile.name} (id=${driveFile.id})`);
  } catch (err) {
    driveError = err.message;
    console.warn('[backup] Drive upload failed:', err.message);
  }

  console.log(`[backup] Done — records: ${JSON.stringify(data.counts)}, pruned: ${pruned}`);
  return { filename, counts: data.counts, driveFile, pruned, driveError };
}

// Run directly: node src/backup.js
if (require.main === module) {
  runBackup()
    .then(r => { console.log('[backup] Success:', r.filename); process.exit(0); })
    .catch(e => { console.error('[backup] Failed:', e); process.exit(1); });
}

module.exports = { runBackup, exportAllData };
