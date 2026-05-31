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
app.use('/api/cm-sync', require('./routes/cmSync'));
app.use('/api/backup',  authMiddleware, require('./routes/backup'));

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
  app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));

  // Daily backup at 03:00 UTC
  try {
    const cron = require('node-cron');
    const { runBackup } = require('./backup');
    cron.schedule('0 3 * * *', () => {
      runBackup().catch(e => console.error('[backup-cron] error:', e.message));
    });
    console.log('[backup-cron] Daily backup scheduled at 03:00 UTC');
  } catch (e) {
    console.warn('[backup-cron] Could not schedule backup:', e.message);
  }
}).catch(err => {
  console.error('DB sync error:', err.message);
  process.exit(1);
});
