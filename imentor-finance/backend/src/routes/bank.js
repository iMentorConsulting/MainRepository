const router = require('express').Router();
const multer = require('multer');
const { Op } = require('sequelize');
const BankTransaction = require('../models/BankTransaction');
const { parseStatement, ParseError } = require('../services/bankParsers');
const { BANKS, ingest } = require('../services/bankIngest');
const BankConnection = require('../models/BankConnection');
const { getProvider } = require('../services/bankProviders');
const { syncAll, applyConsentResult, syncConnection } = require('../services/bankSync');
const { signState } = require('../services/bankState');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.get('/banks', (_, res) => res.json(BANKS));

// GET /api/bank/transactions?direction=credit|debit&bank=&unseen=1&no_invoice=1&q=&limit=
router.get('/transactions', async (req, res) => {
  try {
    const { direction, bank, unseen, no_invoice, q, limit } = req.query;
    const where = {};
    if (direction === 'credit' || direction === 'debit') where.direction = direction;
    if (bank) where.bank = bank;
    if (unseen === '1') where.seen = false;
    if (no_invoice === '1') { where.direction = 'credit'; where.invoice_issued = { [Op.or]: [null, false] }; }
    if (q) {
      const like = { [Op.iLike]: `%${q}%` };
      where[Op.or] = [{ description: like }, { counterparty: like }, { note: like }, { category: like }];
    }
    const rows = await BankTransaction.findAll({
      where, order: [['tx_date', 'DESC'], ['id', 'DESC']], limit: Math.min(Number(limit) || 500, 2000),
    });
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/summary', async (_, res) => {
  try {
    const [new_credits, new_debits, credits_without_invoice] = await Promise.all([
      BankTransaction.count({ where: { direction: 'credit', seen: false } }),
      BankTransaction.count({ where: { direction: 'debit', seen: false } }),
      BankTransaction.count({ where: { direction: 'credit', invoice_issued: { [Op.or]: [null, false] } } }),
    ]);
    const test_count = await BankTransaction.count({ where: { is_test: true } });
    res.json({ new_credits, new_debits, credits_without_invoice, test_count });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH one transaction: note, category, invoice_issued (true/false/null), seen
router.patch('/transactions/:id', async (req, res) => {
  try {
    const tx = await BankTransaction.findByPk(req.params.id);
    if (!tx) return res.status(404).json({ error: 'Δεν βρέθηκε' });
    const patch = {};
    for (const k of ['note', 'category']) if (typeof req.body[k] === 'string') patch[k] = req.body[k];
    if ('invoice_issued' in req.body) {
      const v = req.body.invoice_issued;
      if (v !== null && typeof v !== 'boolean') return res.status(400).json({ error: 'invoice_issued: true/false/null' });
      patch.invoice_issued = v;
    }
    if (typeof req.body.seen === 'boolean') patch.seen = req.body.seen;
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Τίποτα προς ενημέρωση' });
    await tx.update(patch);
    res.json(tx);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/mark-seen', async (req, res) => {
  try {
    const where = ['credit', 'debit'].includes(req.body?.direction) ? { direction: req.body.direction } : {};
    await BankTransaction.update({ seen: true }, { where });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/bank/import  (multipart: bank, file) — CSV or MT940 statement
router.post('/import', upload.single('file'), async (req, res) => {
  try {
    const bank = req.body.bank;
    if (!BANKS[bank]) return res.status(400).json({ error: `Η τράπεζα πρέπει να είναι μία από: ${Object.keys(BANKS).join(', ')}` });
    if (!req.file) return res.status(400).json({ error: 'Δεν βρέθηκε αρχείο' });
    const rows = parseStatement(req.file.buffer);
    res.json(await ingest(bank, rows));
  } catch (e) {
    if (e instanceof ParseError) return res.status(422).json({ error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ── Bank connections (consent given to read each bank) ──────────────────────────────────────
router.get('/connections', async (_, res) => {
  try {
    const provider = getProvider();
    const rows = await BankConnection.findAll({ where: { provider: provider.key() } });
    res.json({
      provider: provider.name,
      env: provider.env ? provider.env() : '',
      configured: provider.isConfigured(),
      connections: provider.banks.map(bank => {
        const c = rows.find(r => r.bank === bank);
        return {
          bank, label: BANKS[bank], status: c && !(c.status === 'pending' && !c.consent_id) ? c.status : 'none',
          sca_type: c?.sca_type || '', consent_expires_at: c?.consent_expires_at || null, last_sync_at: c?.last_sync_at || null, last_error: c?.last_error || '',
        };
      }),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Start (or renew) the consent for one bank → returns the bank's login URL for the browser to open
router.post('/connections', async (req, res) => {
  let conn = null, created = false;
  try {
    const provider = getProvider();
    const bank = req.body?.bank;
    if (!provider.banks.includes(bank)) return res.status(400).json({ error: 'Άγνωστη τράπεζα' });
    if (!provider.isConfigured()) return res.status(409).json({ error: 'Δεν έχουν ρυθμιστεί τα στοιχεία πρόσβασης του παρόχου (Railway variables).' });
    [conn, created] = await BankConnection.findOrCreate({ where: { provider: provider.key(), bank }, defaults: { status: 'pending' } });
    const redirectUri = `${req.protocol}://${req.get('host')}/api/bank/callback`;
    const { redirectUrl, consentId } = await provider.startConsent({ bank, redirectUri, state: signState(conn.id), psuIp: req.ip });
    if (consentId) await conn.update({ consent_id: consentId });
    res.json({ redirect_url: redirectUrl });
  } catch (e) {
    // a failed first attempt must not leave a "Σε εξέλιξη" card behind
    if (conn && created) await conn.destroy().catch(() => {});
    res.status(e.code === 'PROVIDER_NOT_READY' ? 503 : 500).json({ error: e.message });
  }
});

// Piraeus (SMS OTP): the user types the code received by SMS to finish connecting
router.post('/connections/otp', async (req, res) => {
  try {
    const provider = getProvider();
    const { bank, otp } = req.body || {};
    const conn = await BankConnection.findOne({ where: { provider: provider.key(), bank } });
    if (!conn || conn.status !== 'pending') return res.status(404).json({ error: 'Δεν υπάρχει σύνδεση που να περιμένει κωδικό.' });
    if (!/^\d{4,10}$/.test(String(otp || ''))) return res.status(400).json({ error: 'Μη έγκυρος κωδικός OTP.' });
    await applyConsentResult(conn, await provider.submitOtp({ connection: conn, otp, psuIp: req.ip }), req.ip);
    if (conn.status === 'active') syncConnection(conn, { psuIp: req.ip }).catch(e => console.warn('[bank-otp] first sync failed:', e.message));
    res.json({ status: conn.status });
  } catch (e) { res.status(e.code === 'PROVIDER_NOT_READY' ? 503 : 400).json({ error: e.message }); }
});

// "Ανανέωση τώρα": fetch new movements right now for every active connection
router.post('/sync', async (req, res) => {
  try {
    const days = Math.min(Math.max(Number(req.body?.days) || 0, 0), 3650);
    res.json(await syncAll({ psuIp: req.ip, days }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Provider diagnostics (admin buttons on the Τράπεζες page) ────────────────────────────────
router.get('/provider/check', async (_, res) => {
  try {
    const provider = getProvider();
    if (!provider.isConfigured()) return res.status(409).json({ error: 'Λείπουν τα NBG_* στοιχεία πρόσβασης στο Railway.' });
    res.json(await provider.diagnose());
  } catch (e) { res.status(502).json({ error: e.message }); }
});

router.post('/provider/sandbox', async (_, res) => {
  try {
    const provider = getProvider();
    if (!provider.isConfigured()) return res.status(409).json({ error: 'Λείπουν τα NBG_* στοιχεία πρόσβασης στο Railway.' });
    if (!provider.createSandbox || provider.env() === 'production') return res.status(409).json({ error: 'Το sandbox δημιουργείται μόνο στο περιβάλλον sandbox.' });
    res.json(await provider.createSandbox());
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// Read-only look at what the bank returns (nothing stored): ?bank=nbg&days=3650
router.get('/provider/probe', async (req, res) => {
  try {
    const provider = getProvider();
    const bank = req.query.bank;
    if (!provider.banks.includes(bank) || !provider.probe) return res.status(400).json({ error: 'Άγνωστη τράπεζα' });
    const conn = await BankConnection.findOne({ where: { provider: provider.key(), bank } });
    if (!conn || conn.status !== 'active') return res.status(409).json({ error: 'Η τράπεζα δεν είναι συνδεδεμένη.' });
    const days = Math.min(Math.max(Number(req.query.days) || 365, 1), 3650);
    const iso = d => new Date(d).toISOString().slice(0, 10);
    res.json(await provider.probe({ bank, from: iso(Date.now() - days * 86400000), to: iso(Date.now()), psuIp: req.ip || conn.psu_ip }));
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// Remove sandbox/mock rows (they must never mix with real money)
router.delete('/test-data', async (_, res) => {
  try { res.json({ deleted: await BankTransaction.destroy({ where: { is_test: true } }) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
