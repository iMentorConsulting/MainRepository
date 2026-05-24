const router = require('express').Router();
const { Op } = require('sequelize');
const ServiceAgreement = require('../models/ServiceAgreement');

router.get('/', async (req, res) => {
  try {
    const { status, customer_id, search, limit = 100, offset = 0 } = req.query;
    const where = {};
    if (status) where.status = status;
    if (customer_id) where.customer_id = parseInt(customer_id);
    if (search) where[Op.or] = [
      { customer_name: { [Op.iLike]: `%${search}%` } },
      { service_type: { [Op.iLike]: `%${search}%` } }
    ];
    const { count, rows } = await ServiceAgreement.findAndCountAll({
      where, limit: parseInt(limit), offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });
    res.json({ data: rows, total: count });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const sa = await ServiceAgreement.create(req.body);
    res.json(sa);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const sa = await ServiceAgreement.findByPk(req.params.id);
    if (!sa) return res.status(404).json({ error: 'Δεν βρέθηκε' });
    await sa.update(req.body);
    res.json(sa);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await ServiceAgreement.destroy({ where: { id: req.params.id } });
    res.json({ deleted: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
