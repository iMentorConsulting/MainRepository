const router = require('express').Router();
const { runDailySync, runSyncForRange, buildPayments, getIncomeForDate, getIncomeForDateRange, yesterdayStr } = require('../services/logistisSync');

router.get('/preview', async (req, res) => {
  try {
    const { dateFrom, dateTo, date } = req.query;
    const from = dateFrom || date || yesterdayStr();
    const to   = dateTo   || date || yesterdayStr();
    const rows = await getIncomeForDateRange(from, to);
    const { payments, skipped } = buildPayments(rows);
    res.json({ dateFrom: from, dateTo: to, payments, skipped });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/send', async (req, res) => {
  try {
    const { dateFrom, dateTo, date } = req.body || {};
    const from = dateFrom || date || yesterdayStr();
    const to   = dateTo   || date || yesterdayStr();
    const result = await runSyncForRange(from, to);
    global._lastLogistisSync = { ran_at: new Date().toISOString(), ok: true, ...result };
    res.json(result);
  } catch (e) {
    global._lastLogistisSync = { ran_at: new Date().toISOString(), ok: false, error: e.message };
    res.status(500).json({ error: e.message });
  }
});

router.get('/status', (req, res) => {
  res.json(global._lastLogistisSync || { ran_at: null });
});

module.exports = router;
