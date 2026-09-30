const router = require('express').Router();
const { buildCmPayments, sendBatchToCm, getIncomeForDateRange, yesterdayStr } = require('../services/logistisSync');

// GET /api/cm-push/preview?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD
// Shows what would be sent to CM without actually sending.
router.get('/preview', async (req, res) => {
  try {
    const { dateFrom, dateTo, date } = req.query;
    const from = dateFrom || date || yesterdayStr();
    const to   = dateTo   || date || yesterdayStr();
    const rows = await getIncomeForDateRange(from, to);
    const payments = buildCmPayments(rows);
    res.json({ dateFrom: from, dateTo: to, count: payments.length, payments });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/cm-push/send  { dateFrom, dateTo } or { date }
// Manually push a date range of payments to CM.
router.post('/send', async (req, res) => {
  try {
    const { dateFrom, dateTo, date } = req.body || {};
    const from = dateFrom || date || yesterdayStr();
    const to   = dateTo   || date || yesterdayStr();
    const rows = await getIncomeForDateRange(from, to);
    const payments = buildCmPayments(rows);
    if (!payments.length) {
      return res.json({ sent: 0, result: null, message: 'Δεν υπάρχουν πληρωμές για αποστολή σε αυτό το διάστημα.' });
    }
    const result = await sendBatchToCm(payments);
    global._lastCmPush = { ran_at: new Date().toISOString(), ok: true, dateFrom: from, dateTo: to, sent: payments.length, result };
    res.json({ dateFrom: from, dateTo: to, sent: payments.length, result });
  } catch (e) {
    global._lastCmPush = { ran_at: new Date().toISOString(), ok: false, error: e.message };
    res.status(500).json({ error: e.message });
  }
});

// GET /api/cm-push/status — last push result
router.get('/status', (req, res) => {
  res.json(global._lastCmPush || { ran_at: null });
});

module.exports = router;
