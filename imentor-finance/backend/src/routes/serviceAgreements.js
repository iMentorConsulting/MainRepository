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

    // Enrich agreements with collected income; non-fatal if it fails
    const idMap = new Map();
    const nameMap = new Map();
    try {
      // Primary: match by service_agreement_id (for income records properly linked)
      const byId = await sequelize.query(`
        SELECT service_agreement_id,
               COALESCE(SUM(amount_collected), 0) AS total_collected,
               COUNT(*) AS payment_count
        FROM incomes
        WHERE service_agreement_id IS NOT NULL
        GROUP BY service_agreement_id
      `, { type: QueryTypes.SELECT });
      for (const row of byId) {
        idMap.set(Number(row.service_agreement_id), {
          total: parseFloat(row.total_collected || 0),
          count: parseInt(row.payment_count || 0)
        });
      }
      // Fallback: match by lower(trim(customer_name)) for imported data without agreement link
      const byName = await sequelize.query(`
        SELECT LOWER(TRIM(customer_name)) AS cname,
               COALESCE(SUM(amount_collected), 0) AS total_collected,
               COUNT(*) AS payment_count
        FROM incomes
        WHERE customer_name IS NOT NULL
        GROUP BY LOWER(TRIM(customer_name))
      `, { type: QueryTypes.SELECT });
      for (const row of byName) {
        nameMap.set(row.cname, {
          total: parseFloat(row.total_collected || 0),
          count: parseInt(row.payment_count || 0)
        });
      }
    } catch (enrichErr) {
      console.error('Income enrichment failed (non-fatal):', enrichErr.message);
    }

    const enriched = rows.map(sa => {
      const byIdMatch = idMap.get(sa.id);
      const byNameMatch = nameMap.get((sa.customer_name || '').toLowerCase().trim());
      const inc = byIdMatch || byNameMatch || { total: 0, count: 0 };
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
