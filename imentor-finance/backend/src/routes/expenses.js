const router = require('express').Router();
const { Op } = require('sequelize');
const Expense = require('../models/Expense');

router.get('/', async (req, res) => {
  try {
    const { year, month, category, supplier, search, page = 1, limit = 50 } = req.query;
    const where = {};
    if (year) where.date = { [Op.between]: [`${year}-01-01`, `${year}-12-31`] };
    if (month && year) where.date = { [Op.between]: [`${year}-${month.padStart(2,'0')}-01`, `${year}-${month.padStart(2,'0')}-31`] };
    if (category) where.category = category;
    if (supplier) where.supplier = supplier;
    if (search) where[Op.or] = [
      { supplier: { [Op.iLike]: `%${search}%` } },
      { description: { [Op.iLike]: `%${search}%` } }
    ];

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { count, rows } = await Expense.findAndCountAll({
      where, order: [['date', 'DESC'], ['id', 'DESC']],
      limit: parseInt(limit), offset
    });
    res.json({ total: count, page: parseInt(page), data: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const record = await Expense.create(req.body);
    res.status(201).json(record);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const record = await Expense.findByPk(req.params.id);
    if (!record) return res.status(404).json({ error: 'Δεν βρέθηκε' });
    res.json(record);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const record = await Expense.findByPk(req.params.id);
    if (!record) return res.status(404).json({ error: 'Δεν βρέθηκε' });
    await record.update(req.body);
    res.json(record);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const record = await Expense.findByPk(req.params.id);
    if (!record) return res.status(404).json({ error: 'Δεν βρέθηκε' });
    await record.destroy();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
