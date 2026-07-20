const router = require('express').Router();
const PayrollEmployeeSetting = require('../models/PayrollEmployeeSetting');

router.get('/', async (req, res) => {
  try {
    const rows = await PayrollEmployeeSetting.findAll({ order: [['employee_name', 'ASC']] });
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Upsert by employee_name — does NOT overwrite monthly_overrides unless explicitly sent
router.post('/', async (req, res) => {
  try {
    const { employee_name, visible, target_type, target_value, monthly_overrides } = req.body;
    if (!employee_name) return res.status(400).json({ error: 'employee_name required' });
    const [record, created] = await PayrollEmployeeSetting.findOrCreate({
      where: { employee_name: employee_name.trim() },
      defaults: { visible, target_type, target_value, monthly_overrides: monthly_overrides ?? {} }
    });
    if (!created) {
      const patch = { visible, target_type, target_value };
      if (monthly_overrides !== undefined) patch.monthly_overrides = monthly_overrides;
      await record.update(patch);
    }
    res.json(record);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Set or clear a single month's override without touching other settings
router.patch('/override', async (req, res) => {
  try {
    const { employee_name, year_month, value } = req.body;
    if (!employee_name || !year_month) return res.status(400).json({ error: 'employee_name and year_month required' });
    const [record] = await PayrollEmployeeSetting.findOrCreate({
      where: { employee_name: employee_name.trim() },
      defaults: { visible: true, target_type: 'multiplier', target_value: 4.2, monthly_overrides: {} }
    });
    const overrides = { ...(record.monthly_overrides || {}) };
    if (value === null || value === undefined || value === '') {
      delete overrides[year_month];
    } else {
      overrides[year_month] = parseFloat(value);
    }
    await record.update({ monthly_overrides: overrides });
    res.json(record);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const record = await PayrollEmployeeSetting.findByPk(req.params.id);
    if (!record) return res.status(404).json({ error: 'Not found' });
    await record.update(req.body);
    res.json(record);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await PayrollEmployeeSetting.destroy({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
