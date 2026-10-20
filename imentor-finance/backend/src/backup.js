'use strict';
require('dotenv').config();

const fs     = require('fs');
const path   = require('path');
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
const CODE_FOLDER_ID   = process.env.GDRIVE_CODE_FOLDER_ID   || BACKUP_FOLDER_ID;

function getServiceAccountKey() {
  const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const b64Key  = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const src = rawJson || b64Key;
  if (!src) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON (or GOOGLE_SERVICE_ACCOUNT_KEY) is not set in Railway env vars');
  // Try each source — pick the first one that contains a valid JSON object
  for (const candidate of [rawJson, b64Key].filter(Boolean)) {
    // Direct: find { ... } boundaries (handles surrounding quotes/whitespace)
    const s = candidate.indexOf('{'); const e = candidate.lastIndexOf('}');
    if (s !== -1 && e > s) {
      try { return JSON.parse(candidate.slice(s, e + 1)); } catch (_) {}
    }
    // Base64-encoded fallback
    try {
      const decoded = Buffer.from(candidate.trim(), 'base64').toString('utf8');
      const s2 = decoded.indexOf('{'); const e2 = decoded.lastIndexOf('}');
      if (s2 !== -1 && e2 > s2) return JSON.parse(decoded.slice(s2, e2 + 1));
    } catch (_) {}
  }
  throw new Error('Cannot parse service account key from GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_KEY — paste the raw JSON file contents into Railway');
}

// Service account authenticates as itself (no impersonation needed for Shared Drives)
async function getDriveAccessToken() {
  const key = getServiceAccountKey();

  const now = Math.floor(Date.now() / 1000);
  const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: key.client_email,
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

async function uploadToFolder(accessToken, folderId, filename, jsonContent) {
  const boundary = `bk_${Date.now()}`;
  const metadata = JSON.stringify({ name: filename, parents: [folderId] });
  const body = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${jsonContent}\r\n` +
    `--${boundary}--`
  );
  const { status, data } = await driveRequest(
    'POST',
    '/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink&supportsAllDrives=true',
    accessToken, body,
    `multipart/related; boundary=${boundary}`
  );
  if (status < 200 || status >= 300) throw new Error(`Drive upload ${status}: ${JSON.stringify(data)}`);
  return data;
}

async function uploadToDrive(accessToken, filename, jsonContent) {
  return uploadToFolder(accessToken, BACKUP_FOLDER_ID, filename, jsonContent);
}

async function pruneOldBackups(accessToken, keepCount = 30) {
  const q = encodeURIComponent(`'${BACKUP_FOLDER_ID}' in parents and trashed = false`);
  const { status, data } = await driveRequest(
    'GET',
    `/drive/v3/files?q=${q}&orderBy=createdTime+desc&fields=files(id,name)&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    accessToken
  );
  if (status !== 200) return 0;
  const toDelete = (data.files || []).slice(keepCount);
  for (const f of toDelete) {
    await driveRequest('DELETE', `/drive/v3/files/${f.id}`, accessToken).catch(() => {});
  }
  return toDelete.length;
}

const CODE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.css', '.json', '.html', '.env.example']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'public', '.vite', 'coverage']);

function walkDir(dir, baseLabel, files = {}) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const rel  = `${baseLabel}/${entry.name}`;
    if (entry.isDirectory()) {
      walkDir(full, rel, files);
    } else if (CODE_EXTENSIONS.has(path.extname(entry.name))) {
      try {
        const content = fs.readFileSync(full, 'utf8');
        if (content.length < 500_000) files[rel] = content; // skip giant generated files
      } catch (_) {}
    }
  }
  return files;
}

async function collectCodeSnapshot() {
  const backendSrc  = path.join(__dirname);
  const frontendSrc = path.join(__dirname, '../../frontend/src');
  const files = {};
  walkDir(backendSrc,  'backend/src',   files);
  walkDir(frontendSrc, 'frontend/src',  files);
  return {
    snapshot_at:  new Date().toISOString(),
    file_count:   Object.keys(files).length,
    files,
  };
}

async function runCodeBackup(accessToken) {
  const data = await collectCodeSnapshot();
  const ts   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `imentor-code-snapshot-${ts}.json`;
  const file = await uploadToFolder(accessToken, CODE_FOLDER_ID, filename, JSON.stringify(data, null, 2));
  console.log(`[backup] Code snapshot uploaded: ${file.name} (${data.file_count} files)`);
  return { filename, file_count: data.file_count, driveFile: file };
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
  console.log('[backup] Starting database + code export…');
  await sequelize.authenticate();

  const data = await exportAllData();
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `imentor-finance-backup-${ts}.json`;
  const jsonContent = JSON.stringify(data, null, 2);

  let driveFile = null;
  let pruned = 0;
  let driveError = null;
  let codeSnapshot = null;
  let codeError = null;

  try {
    const accessToken = await getDriveAccessToken();
    // Data backup
    driveFile = await uploadToDrive(accessToken, filename, jsonContent);
    pruned = await pruneOldBackups(accessToken);
    console.log(`[backup] Data uploaded: ${driveFile.name}`);
    // Code snapshot
    try {
      codeSnapshot = await runCodeBackup(accessToken);
    } catch (ce) {
      codeError = ce.message;
      console.warn('[backup] Code snapshot failed:', ce.message);
    }
  } catch (err) {
    driveError = err.message;
    console.warn('[backup] Drive upload failed:', err.message);
  }

  console.log(`[backup] Done — records: ${JSON.stringify(data.counts)}, pruned: ${pruned}, code: ${codeSnapshot?.file_count ?? 'failed'} files`);
  return { filename, counts: data.counts, driveFile, pruned, driveError, codeSnapshot, codeError };
}

// Run directly: node src/backup.js
if (require.main === module) {
  runBackup()
    .then(r => { console.log('[backup] Success:', r.filename); process.exit(0); })
    .catch(e => { console.error('[backup] Failed:', e); process.exit(1); });
}

module.exports = { runBackup, exportAllData };
