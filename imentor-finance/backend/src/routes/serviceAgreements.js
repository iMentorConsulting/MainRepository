const router = require('express').Router();
const { Op, QueryTypes } = require('sequelize');
const ServiceAgreement = require('../models/ServiceAgreement');
const sequelize = require('../config/db');

router.get('/stats', async (req, res) => {
  try {
    const counts = await ServiceAgreement.findAll({
      attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
      group: ['status'],
      raw: true
    });
    const byStatus = {};
    let total = 0;
    for (const { status, count } of counts) {
      byStatus[status] = parseInt(count);
      total += parseInt(count);
    }
    res.json({ total, byStatus });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/', async (req, res) => {
  try {
    const { status, customer_id, customer_name, search, sales_agent, service_type, limit = 50, offset = 0, page } = req.query;
    const actualOffset = page ? (parseInt(page) - 1) * parseInt(limit) : parseInt(offset);
    const where = {};
    if (status) where.status = status;
    if (customer_id) where.customer_id = parseInt(customer_id);
    if (customer_name) where.customer_name = { [Op.iLike]: `%${customer_name}%` };
    if (sales_agent) where.sales_agent = sales_agent;
    if (service_type) where.service_type = service_type;
    if (search) where[Op.or] = [
      { customer_name: { [Op.iLike]: `%${search}%` } },
      { service_type: { [Op.iLike]: `%${search}%` } }
    ];
    const { count, rows } = await ServiceAgreement.findAndCountAll({
      where, limit: parseInt(limit), offset: actualOffset,
      order: [['createdAt', 'DESC']]
    });

    // For each agreement, compute the actual collected from incomes by customer_name + service_type
    const incomeSums = await sequelize.query(`
      SELECT customer_name, service_type, COALESCE(SUM(amount_collected), 0) AS total_collected, COUNT(*) AS payment_count
      FROM incomes
      WHERE customer_name IS NOT NULL
      GROUP BY customer_name, service_type
    `, { type: QueryTypes.SELECT });
    const sumMap = new Map();
    for (const row of incomeSums) {
      sumMap.set(`${row.customer_name}|||${row.service_type || ''}`, { total: parseFloat(row.total_collected), count: parseInt(row.payment_count) });
    }

    const enriched = rows.map(sa => {
      const key = `${sa.customer_name}|||${sa.service_type || ''}`;
      const inc = sumMap.get(key) || { total: 0, count: 0 };
      return { ...sa.toJSON(), income_collected: inc.total, income_payment_count: inc.count };
    });

    res.json({ data: enriched, total: count });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const COMPLETED_STATUSES = ['ΑΠΟΠΛΗΡΩΜΕΝΕΣ', 'ΟΛΟΚΛΗΡΩΜΕΝΕΣ ΕΠΙΤΥΧΩΣ', 'ΟΛΟΚΛΗΡΩΜΕΝΕΣ FAIL'];

async function applyAutoStatus(sa) {
  const collected = parseFloat(sa.amount_collected_total || 0);
  const application = parseFloat(sa.amount_application || 0);
  if (application > 0 && collected >= application && !COMPLETED_STATUSES.includes(sa.status)) {
    await sa.update({ status: 'ΑΠΟΠΛΗΡΩΜΕΝΕΣ' });
  }
}

router.post('/', async (req, res) => {
  try {
    const sa = await ServiceAgreement.create(req.body);
    await applyAutoStatus(sa);
    res.json(sa);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const sa = await ServiceAgreement.findByPk(req.params.id);
    if (!sa) return res.status(404).json({ error: 'Δεν βρέθηκε' });
    await sa.update(req.body);
    await applyAutoStatus(sa);
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
