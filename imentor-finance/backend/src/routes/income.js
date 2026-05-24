const router = require('express').Router();
const { Op } = require('sequelize');
const Income = require('../models/Income');

router.get('/', async (req, res) => {
  try {
    const { year, month, service_type, sales_agent, search, page = 1, limit = 50 } = req.query;
    const where = {};
    if (year) where.sale_date = { [Op.between]: [`${year}-01-01`, `${year}-12-31`] };
    if (month && year) where.sale_date = { [Op.between]: [`${year}-${month.padStart(2,'0')}-01`, `${year}-${month.padStart(2,'0')}-31`] };
    if (service_type) where.service_type = service_type;
    if (sales_agent) where.sales_agent = sales_agent;
    if (search) where.customer_name = { [Op.iLike]: `%${search}%` };

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { count, rows } = await Income.findAndCountAll({
      where, order: [['sale_date', 'DESC'], ['id', 'DESC']],
      limit: parseInt(limit), offset
    });
    res.json({ total: count, page: parseInt(page), data: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const body = req.body;
    const record = await Income.create(body);
    res.status(201).json(record);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const record = await Income.findByPk(req.params.id);
    if (!record) return res.status(404).json({ error: 'Δεν βρέθηκε' });
    res.json(record);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const record = await Income.findByPk(req.params.id);
    if (!record) return res.status(404).json({ error: 'Δεν βρέθηκε' });
    const body = req.body;
    await record.update(body);
    res.json(record);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const record = await Income.findByPk(req.params.id);
    if (!record) return res.status(404).json({ error: 'Δεν βρέθηκε' });
    await record.destroy();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
