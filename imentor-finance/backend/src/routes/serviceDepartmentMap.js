const router = require('express').Router();
const ServiceDepartmentMap = require('../models/ServiceDepartmentMap');

// GET all mappings
router.get('/', async (req, res) => {
  try {
    const rows = await ServiceDepartmentMap.findAll({ raw: true });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT (upsert) a single mapping
router.put('/:service', async (req, res) => {
  try {
    const service_name = decodeURIComponent(req.params.service);
    const { department } = req.body;
    if (!department) {
      await ServiceDepartmentMap.destroy({ where: { service_name } });
      return res.json({ ok: true, deleted: true });
    }
    const [row] = await ServiceDepartmentMap.upsert({ service_name, department });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
