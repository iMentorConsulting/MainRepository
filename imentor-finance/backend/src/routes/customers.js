const router = require('express').Router();
const { Op } = require('sequelize');
const Customer = require('../models/Customer');

router.get('/', async (req, res) => {
  try {
    const { search, limit = 20 } = req.query;
    const where = {};
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { vat_number: { [Op.iLike]: `%${search}%` } }
      ];
    }
    const rows = await Customer.findAll({ where, limit: parseInt(limit), order: [['name', 'ASC']] });
    res.json({ data: rows, total: rows.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const c = await Customer.create(req.body);
    res.json(c);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const c = await Customer.findByPk(req.params.id);
    if (!c) return res.status(404).json({ error: 'Δεν βρέθηκε' });
    await c.update(req.body);
    res.json(c);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await Customer.destroy({ where: { id: req.params.id } });
    res.json({ deleted: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
