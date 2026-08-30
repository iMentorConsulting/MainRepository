const router = require('express').Router();
const AppSetting = require('../models/AppSetting');

router.get('/:key', async (req, res) => {
  try {
    const s = await AppSetting.findByPk(req.params.key);
    if (!s) return res.json(null);
    try { res.json(JSON.parse(s.value)); }
    catch { res.json(s.value); }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:key', async (req, res) => {
  try {
    const value = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    await AppSetting.upsert({ key: req.params.key, value });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
