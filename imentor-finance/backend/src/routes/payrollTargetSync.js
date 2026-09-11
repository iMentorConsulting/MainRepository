const router = require('express').Router();
const { runPayrollTargetSync, buildEmployeeTargets } = require('../services/payrollTargetSync');

// Preview — shows what would be sent without actually pushing
router.get('/preview', async (req, res) => {
  try {
    const payload = await buildEmployeeTargets();
    res.json(payload);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Manual trigger — pushes to all configured webhooks immediately
router.post('/send', async (req, res) => {
  try {
    const result = await runPayrollTargetSync();
    global._lastPayrollTargetSync = result;
    res.json(result);
  } catch (e) {
    global._lastPayrollTargetSync = { ran_at: new Date().toISOString(), ok: false, error: e.message };
    res.status(500).json({ error: e.message });
  }
});

// Last sync status
router.get('/status', (req, res) => {
  res.json(global._lastPayrollTargetSync || { ran_at: null });
});

module.exports = router;
