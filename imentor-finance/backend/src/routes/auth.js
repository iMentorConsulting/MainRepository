const router = require('express').Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const rateLimit = require('express-rate-limit');
const AppSetting = require('../models/AppSetting');
const authMiddleware = require('../middleware/auth');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Πολλές αποτυχημένες προσπάθειες. Δοκιμάστε ξανά σε 15 λεπτά.' },
  skipSuccessfulRequests: true,
});

async function getTotpSecret() {
  const row = await AppSetting.findByPk('totp_secret');
  return row?.value || null;
}

function verifyTotp(secret, token) {
  return speakeasy.totp.verify({ secret, encoding: 'base32', token, window: 1 });
}

// ── POST /auth/login ──────────────────────────────────────────────────────────
router.post('/login', loginLimiter, async (req, res) => {
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD;

  let valid = false;
  if (adminPassword && adminPassword.startsWith('$2')) {
    valid = await bcrypt.compare(password, adminPassword);
  } else {
    valid = password === adminPassword;
  }

  if (!valid) return res.status(401).json({ error: 'Λάθος κωδικός' });

  const totpSecret = await getTotpSecret();
  if (totpSecret) {
    // Password OK but 2FA required — issue a 5-min temp token
    const tempToken = jwt.sign({ step: '2fa_pending' }, process.env.JWT_SECRET, { expiresIn: '5m' });
    return res.json({ requires_2fa: true, temp_token: tempToken });
  }

  const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '6h' });
  res.json({ token });
});

// ── POST /auth/2fa/verify ─────────────────────────────────────────────────────
router.post('/2fa/verify', async (req, res) => {
  const { temp_token, code } = req.body;
  if (!temp_token || !code) return res.status(400).json({ error: 'Λείπουν στοιχεία' });

  let payload;
  try {
    payload = jwt.verify(temp_token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Ληγμένος κωδικός — συνδεθείτε ξανά' });
  }

  if (payload.step !== '2fa_pending') return res.status(401).json({ error: 'Μη έγκυρο token' });

  const totpSecret = await getTotpSecret();
  if (!totpSecret) return res.status(400).json({ error: '2FA δεν έχει ρυθμιστεί' });

  if (!verifyTotp(totpSecret, code)) {
    return res.status(401).json({ error: 'Λάθος κωδικός authenticator' });
  }

  const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '6h' });
  res.json({ token });
});

// ── GET /auth/2fa/status ──────────────────────────────────────────────────────
router.get('/2fa/status', authMiddleware, async (_req, res) => {
  const secret = await getTotpSecret();
  res.json({ enabled: !!secret });
});

// ── GET /auth/2fa/setup — generate new secret + QR (not saved yet) ───────────
router.get('/2fa/setup', authMiddleware, async (_req, res) => {
  const generated = speakeasy.generateSecret({
    name: 'iMentor Finance',
    issuer: 'iMentor Finance',
    length: 20,
  });
  const qrDataUrl = await QRCode.toDataURL(generated.otpauth_url);
  res.json({ secret: generated.base32, qr: qrDataUrl });
});

// ── POST /auth/2fa/activate — verify code then save secret ───────────────────
router.post('/2fa/activate', authMiddleware, async (req, res) => {
  const { secret, code } = req.body;
  if (!secret || !code) return res.status(400).json({ error: 'Λείπουν στοιχεία' });

  if (!verifyTotp(secret, code)) {
    return res.status(400).json({ error: 'Λάθος κωδικός — σκανάρετε ξανά το QR και δοκιμάστε' });
  }

  await AppSetting.upsert({ key: 'totp_secret', value: secret });
  res.json({ ok: true });
});

// ── DELETE /auth/2fa — disable 2FA (requires live TOTP code) ─────────────────
router.delete('/2fa', authMiddleware, async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Απαιτείται κωδικός authenticator για απενεργοποίηση' });

  const totpSecret = await getTotpSecret();
  if (!totpSecret) return res.status(400).json({ error: '2FA δεν είναι ενεργό' });

  if (!verifyTotp(totpSecret, code)) {
    return res.status(401).json({ error: 'Λάθος κωδικός authenticator' });
  }

  await AppSetting.destroy({ where: { key: 'totp_secret' } });
  res.json({ ok: true });
});

module.exports = router;
