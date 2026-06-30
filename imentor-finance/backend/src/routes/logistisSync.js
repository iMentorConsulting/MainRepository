const router = require('express').Router();
const { runDailySync, buildPayments, getIncomeForDate, yesterdayStr } = require('../services/logistisSync');

router.get('/preview', async (req, res) => {
  try {
    const date = req.query.date || yesterdayStr();
    const rows = await getIncomeForDate(date);
    const { payments, skipped } = buildPayments(rows);
    res.json({ date, payments, skipped });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/send', async (req, res) => {
  try {
    const result = await runDailySync(req.body?.date);
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
