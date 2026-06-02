'use strict';
require('dotenv').config();

const { google } = require('googleapis');
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

// Google Drive folder where backups land
const BACKUP_FOLDER_ID = process.env.GDRIVE_BACKUP_FOLDER_ID || '19FRqXOTePavaJ07CmKFTWF4aKKJTraE4';

function getDriveClient() {
  // Support raw JSON (GOOGLE_SERVICE_ACCOUNT_JSON, same as gmail.js) or
  // legacy base64-encoded form (GOOGLE_SERVICE_ACCOUNT_KEY)
  const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const b64Key  = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!rawJson && !b64Key) throw new Error('Neither GOOGLE_SERVICE_ACCOUNT_JSON nor GOOGLE_SERVICE_ACCOUNT_KEY is set');
  let key;
  if (rawJson) {
    key = JSON.parse(rawJson);
  } else {
    key = JSON.parse(Buffer.from(b64Key, 'base64').toString('utf8'));
  }
  // Impersonate a real user so files land in their Drive quota (same pattern as gmail.js)
  const impersonateEmail = process.env.GDRIVE_IMPERSONATE_EMAIL || process.env.GMAIL_USER;
  if (!impersonateEmail) throw new Error('Set GDRIVE_IMPERSONATE_EMAIL (or GMAIL_USER) to the Google Workspace account to impersonate for Drive uploads');
  const auth = new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ['https://www.googleapis.com/auth/drive'],
    subject: impersonateEmail,
  });
  return google.drive({ version: 'v3', auth });
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
      income: income.length,
      expenses: expenses.length,
      customers: customers.length,
      service_agreements: agreements.length,
      list_items: listItems.length,
      recurring_expenses: recurring.length,
      commission_logs: commissions.length,
    },
    income,
    expenses,
    customers,
    service_agreements: agreements,
    list_items: listItems,
    recurring_expenses: recurring,
    commission_logs: commissions,
  };
}

async function uploadToDrive(drive, filename, jsonData) {
  const { Readable } = require('stream');
  const content = JSON.stringify(jsonData, null, 2);
  const stream = Readable.from([content]);

  const res = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [BACKUP_FOLDER_ID],
      mimeType: 'application/json',
    },
    media: {
      mimeType: 'application/json',
      body: stream,
    },
    fields: 'id,name,size,webViewLink',
  });
  return res.data;
}

async function pruneOldBackups(drive, keepCount = 30) {
  const list = await drive.files.list({
    q: `'${BACKUP_FOLDER_ID}' in parents and trashed = false`,
    orderBy: 'createdTime desc',
    fields: 'files(id,name,createdTime)',
    pageSize: 100,
  });
  const files = list.data.files || [];
  const toDelete = files.slice(keepCount);
  for (const f of toDelete) {
    await drive.files.delete({ fileId: f.id }).catch(() => {});
  }
  return toDelete.length;
}

async function runBackup() {
  console.log('[backup] Starting database export…');
  await sequelize.authenticate();

  const data = await exportAllData();
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `imentor-finance-backup-${ts}.json`;

  let driveFile = null;
  let pruned = 0;
  let driveError = null;

  try {
    const drive = getDriveClient();
    driveFile = await uploadToDrive(drive, filename, data);
    pruned = await pruneOldBackups(drive);
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
