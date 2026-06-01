'use strict';
const router = require('express').Router();
const { runBackup, exportAllData } = require('../backup');

// GET /api/backup/status — last automated backup info
router.get('/status', (req, res) => {
  res.json(global._lastBackup || { ran_at: null, ok: null });
});

// POST /api/backup/run  — trigger a full backup + Drive upload
router.post('/run', async (req, res) => {
  try {
    const result = await runBackup();
    global._lastBackup = { ran_at: new Date().toISOString(), ok: true, counts: result.counts, filename: result.filename };
    res.json({ ok: true, ...result });
  } catch (e) {
    global._lastBackup = { ran_at: new Date().toISOString(), ok: false, error: e.message };
    res.status(500).json({ error: e.message });
  }
});

// GET /api/backup/export  — download a JSON snapshot immediately (no Drive upload)
router.get('/export', async (req, res) => {
  try {
    const data = await exportAllData();
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="imentor-backup-${ts}.json"`);
    res.send(JSON.stringify(data, null, 2));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
