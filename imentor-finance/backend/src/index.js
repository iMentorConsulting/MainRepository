require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sequelize = require('./config/db');

require('./models/Income');
require('./models/Expense');
require('./models/ListItem');
require('./models/CommissionLog');
require('./models/Customer');
require('./models/ServiceAgreement');
require('./models/RecurringExpense');
require('./models/AppSetting');

const authMiddleware = require('./middleware/auth');

// ── Fix 6: Warn on startup if ADMIN_PASSWORD is not bcrypt-hashed ──────────
if (process.env.ADMIN_PASSWORD && !process.env.ADMIN_PASSWORD.startsWith('$2')) {
  console.warn('\n⚠️  SECURITY WARNING: ADMIN_PASSWORD is stored as plaintext in Railway env vars.');
  console.warn('   Run this once to generate a bcrypt hash and update the env var:');
  console.warn('   node -e "require(\'bcryptjs\').hash(\'YOUR_PASSWORD\', 12).then(h => console.log(h))"');
  console.warn('   Then set ADMIN_PASSWORD=<the hash> in Railway.\n');
}

const app = express();

// ── Fix 4: Restrict CORS ────────────────────────────────────────────────────
// Set CORS_ORIGINS in Railway env vars (comma-separated) to lock down origins.
// In development (no env var set) all origins are allowed so local dev still works.
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
  : null;

app.use(cors(allowedOrigins ? {
  origin: (origin, cb) => {
    // Allow requests with no Origin header (Railway health checks, curl, same-origin)
    if (!origin || allowedOrigins.includes(origin)) cb(null, true);
    else cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
} : undefined));

app.use(express.json({ limit: '10mb' }));

app.use('/api/auth', require('./routes/auth'));

app.use('/api/invoices/tax-rates', require('./routes/invoices')); // kept but unused now
app.use('/api/income',     authMiddleware, require('./routes/income'));
app.use('/api/expenses',   authMiddleware, require('./routes/expenses'));
app.use('/api/lists',      authMiddleware, require('./routes/listItems'));
app.use('/api/invoices',   authMiddleware, require('./routes/invoices'));
app.use('/api/emails',     authMiddleware, require('./routes/emails'));
app.use('/api/reports',    authMiddleware, require('./routes/reports'));
app.use('/api/import',     authMiddleware, require('./routes/importData'));
app.use('/api/customers',          authMiddleware, require('./routes/customers'));
app.use('/api/service-agreements', authMiddleware, require('./routes/serviceAgreements'));
app.use('/api/recurring-expenses', authMiddleware, require('./routes/recurringExpenses'));
// Case management sync — own API-key auth, no user auth middleware
app.use('/api/cm-sync',  require('./routes/cmSync'));
// Pull case data from consult.i-mentor.gr (requires CM_APP_URL + FINANCE_API_KEY env vars)
app.use('/api/cm-cases', authMiddleware, require('./routes/cmCasesFetch'));
app.use('/api/backup',  authMiddleware, require('./routes/backup'));
// Push paid Income rows to Logistis (requires LOGISTIS_BASE_URL + LOGISTIS_API_KEY env vars)
app.use('/api/logistis-sync', authMiddleware, require('./routes/logistisSync'));

app.get('/health', (_, res) => res.json({ ok: true }));

// Serve React frontend in production
if (process.env.NODE_ENV === 'production') {
  const path = require('path');
  app.use(express.static(path.join(__dirname, '../public')));
  app.get('*', (_, res) => res.sendFile(path.join(__dirname, '../public/index.html')));
}

const PORT = process.env.PORT || 3001;

sequelize.sync({ alter: true }).then(async () => {
  console.log('Database connected & synced');

  // Status consolidation: retire old statuses
  try {
    await sequelize.query(
      `UPDATE service_agreements SET status = 'ΟΛΟΚΛΗΡΩΜΕΝΕΣ ΕΠΙΤΥΧΩΣ' WHERE status = 'ΑΠΟΠΛΗΡΩΜΕΝΕΣ'`
    );
    await sequelize.query(
      `UPDATE service_agreements SET status = 'ΕΝ ΕΞΕΛΙΞΕΙ' WHERE status IN ('ΠΑΓΩΜΕΝΕΣ', 'ΑΠΟΠΛΗΡΩΜΗ ΑΙΤΗΣΗΣ')`
    );
    console.log('[migration] Status consolidation complete');
  } catch (e) { console.warn('[migration] status consolidation failed:', e.message); }

  // Deduplicate customers: keep lowest id per vat_number, re-point all references
  try {
    const { QueryTypes } = require('sequelize');
    const dupes = await sequelize.query(`
      SELECT vat_number, MIN(id) AS keep_id, array_agg(id ORDER BY id) AS all_ids
      FROM customers
      WHERE vat_number IS NOT NULL AND TRIM(vat_number) != ''
      GROUP BY vat_number
      HAVING COUNT(*) > 1
    `, { type: QueryTypes.SELECT });

    let dedupCount = 0;
    for (const { keep_id, all_ids } of dupes) {
      const drop_ids = all_ids.filter(id => id !== keep_id);
      if (!drop_ids.length) continue;
      await sequelize.query(`UPDATE income SET customer_id = :keep WHERE customer_id = ANY(:drop)`,
        { replacements: { keep: keep_id, drop: drop_ids }, type: QueryTypes.UPDATE });
      await sequelize.query(`UPDATE service_agreements SET customer_id = :keep WHERE customer_id = ANY(:drop)`,
        { replacements: { keep: keep_id, drop: drop_ids }, type: QueryTypes.UPDATE });
      await sequelize.query(`DELETE FROM customers WHERE id = ANY(:drop)`,
        { replacements: { drop: drop_ids }, type: QueryTypes.DELETE });
      dedupCount += drop_ids.length;
    }
    if (dedupCount > 0) console.log(`[migration] Removed ${dedupCount} duplicate customer(s)`);

    // Partial unique index: one customer per vat_number (non-null, non-empty)
    await sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS customers_vat_unique
      ON customers (TRIM(vat_number))
      WHERE vat_number IS NOT NULL AND TRIM(vat_number) != ''
    `);
    console.log('[migration] Customer deduplication complete');
  } catch (e) { console.warn('[migration] customer dedup failed:', e.message); }

  app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));

  // Daily backup at 18:00 Athens time
  try {
    const cron = require('node-cron');
    const { runBackup } = require('./backup');
    cron.schedule('0 18 * * *', () => {
      runBackup()
        .then(r => {
          const driveOk = !r.driveError;
          global._lastBackup = { ran_at: new Date().toISOString(), ok: driveOk, counts: r.counts, filename: r.filename, driveError: r.driveError || null };
          console.log('[backup-cron] Success:', r.filename, driveOk ? '(Drive OK)' : `(Drive FAILED: ${r.driveError})`);
        })
        .catch(e => {
          global._lastBackup = { ran_at: new Date().toISOString(), ok: false, error: e.message };
          console.error('[backup-cron] error:', e.message);
        });
    }, { timezone: 'Europe/Athens' });
    console.log('[backup-cron] Daily backup scheduled at 18:00 Europe/Athens');
  } catch (e) {
    console.warn('[backup-cron] Could not schedule backup:', e.message);
  }

  // Daily Logistis payments sync at 08:00 Athens time (sends yesterday's Income rows)
  try {
    const cron = require('node-cron');
    const { runDailySync } = require('./services/logistisSync');
    cron.schedule('0 8 * * *', () => {
      runDailySync()
        .then(r => {
          global._lastLogistisSync = { ran_at: new Date().toISOString(), ok: true, ...r };
          console.log(`[logistis-sync] Sent ${r.sent} payment(s) for ${r.date}:`, JSON.stringify(r.result));
        })
        .catch(e => {
          global._lastLogistisSync = { ran_at: new Date().toISOString(), ok: false, error: e.message };
          console.error('[logistis-sync] error:', e.message);
        });
    }, { timezone: 'Europe/Athens' });
    console.log('[logistis-sync] Daily payments sync scheduled at 08:00 Europe/Athens');
  } catch (e) {
    console.warn('[logistis-sync] Could not schedule sync:', e.message);
  }
}).catch(err => {
  console.error('DB sync error:', err.message);
  process.exit(1);
});
