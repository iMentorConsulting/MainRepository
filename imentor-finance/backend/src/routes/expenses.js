const router = require('express').Router();
const { Op, fn, col } = require('sequelize');
const Expense = require('../models/Expense');

const ALLOWED_SORT = ['date','amount','category','supplier','description'];

router.get('/', async (req, res) => {
  try {
    const { year, month, date_from, date_to, category, supplier, search, page = 1, limit = 50, sort_field, sort_dir, hide_no_amount } = req.query;
    const where = {};
    if (date_from && date_to) {
      where.date = { [Op.between]: [date_from, date_to] };
    } else if (date_from) {
      where.date = { [Op.gte]: date_from };
    } else if (date_to) {
      where.date = { [Op.lte]: date_to };
    } else if (year && month) {
      where.date = { [Op.between]: [`${year}-${month.padStart(2,'0')}-01`, `${year}-${month.padStart(2,'0')}-31`] };
    } else if (year) {
      where.date = { [Op.between]: [`${year}-01-01`, `${year}-12-31`] };
    }
    if (category) where.category = category;
    if (supplier) where.supplier = supplier;
    if (hide_no_amount === 'true') where.amount = { [Op.gt]: 0 };
    if (search) where[Op.or] = [
      { supplier: { [Op.iLike]: `%${search}%` } },
      { description: { [Op.iLike]: `%${search}%` } }
    ];

    const sf = ALLOWED_SORT.includes(sort_field) ? sort_field : 'date';
    const sd = sort_dir?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const [{ count, rows }, sumResult, byCatRows] = await Promise.all([
      Expense.findAndCountAll({ where, order: [[sf, sd], ['id', 'DESC']], limit: parseInt(limit), offset }),
      Expense.findOne({ where, attributes: [[fn('SUM', col('amount')), 'total']], raw: true }),
      Expense.findAll({ where, attributes: ['category', 'supplier', [fn('SUM', col('amount')), 'sum']], group: ['category', 'supplier'], order: [['category', 'ASC'], [fn('SUM', col('amount')), 'DESC']], raw: true })
    ]);
    res.json({ total: count, sum: parseFloat(sumResult?.total || 0), by_category: byCatRows, page: parseInt(page), data: rows });
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

router.delete('/zero', async (req, res) => {
  try {
    const count = await Expense.destroy({
      where: { amount: { [Op.or]: [null, 0] } }
    });
    res.json({ success: true, deleted: count });
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
