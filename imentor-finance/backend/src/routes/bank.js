const router = require('express').Router();
const multer = require('multer');
const { Op } = require('sequelize');
const BankTransaction = require('../models/BankTransaction');
const { parseStatement, ParseError } = require('../services/bankParsers');
const { BANKS, ingest } = require('../services/bankIngest');

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
    res.json({ new_credits, new_debits, credits_without_invoice });
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

module.exports = router;
