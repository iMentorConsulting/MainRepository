const router = require('express').Router();
const PayrollEmployeeSetting = require('../models/PayrollEmployeeSetting');

router.get('/', async (req, res) => {
  try {
    const rows = await PayrollEmployeeSetting.findAll({ order: [['employee_name', 'ASC']] });
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Upsert by employee_name
router.post('/', async (req, res) => {
  try {
    const { employee_name, visible, target_type, target_value } = req.body;
    if (!employee_name) return res.status(400).json({ error: 'employee_name required' });
    const [record] = await PayrollEmployeeSetting.findOrCreate({
      where: { employee_name: employee_name.trim() },
      defaults: { visible, target_type, target_value }
    });
    if (record._options?.isNewRecord === false) {
      await record.update({ visible, target_type, target_value });
    }
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
