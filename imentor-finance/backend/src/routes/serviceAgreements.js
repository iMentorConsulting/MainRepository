const router = require('express').Router();
const { Op, QueryTypes } = require('sequelize');
const ServiceAgreement = require('../models/ServiceAgreement');
const sequelize = require('../config/db');

// Exported so income routes can call it after creating/updating income records
async function checkAndAutoStatus(saId) {
  try {
    const sa = await ServiceAgreement.findByPk(saId);
    if (!sa || COMPLETED_STATUSES.includes(sa.status)) return;
    const [row] = await sequelize.query(
      `SELECT COALESCE(SUM(amount_collected),0) AS total FROM income WHERE service_agreement_id = :id`,
      { replacements: { id: saId }, type: QueryTypes.SELECT }
    );
    const collected = parseFloat(row?.total || 0);
    const application = parseFloat(sa.amount_application || 0);
    if (!sa.approval_date) {
      if (collected > 0 && (application === 0 || collected >= application)) {
        await sa.update({ status: 'ΑΠΟΠΛΗΡΩΜΗ ΑΙΤΗΣΗΣ' });
      }
    } else {
      const target = application + parseFloat(sa.amount_implementation || 0);
      if (collected > 0 && (target === 0 || collected >= target)) {
        await sa.update({ status: 'ΑΠΟΠΛΗΡΩΜΕΝΕΣ' });
      }
    }
  } catch (e) {
    console.error('checkAndAutoStatus failed:', e.message);
  }
}

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
    const { status, customer_id, customer_name, search, sales_agent, service_type, sale_year, sale_years, sale_month, sale_months, limit = 50, offset = 0, page, sort_field, sort_dir } = req.query;
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
    // Filter by first income sale_date year/month
    const saleDateConditions = ['service_agreement_id IS NOT NULL'];
    if (sale_years) {
      const years = sale_years.split(',').map(y => parseInt(y.trim())).filter(Boolean);
      if (years.length) saleDateConditions.push(`EXTRACT(YEAR FROM sale_date) IN (${years.join(',')})`);
    } else if (sale_year) {
      saleDateConditions.push(`EXTRACT(YEAR FROM sale_date) = ${parseInt(sale_year)}`);
    }
    if (sale_months) {
      const months = sale_months.split(',').map(m => parseInt(m.trim())).filter(Boolean);
      if (months.length) saleDateConditions.push(`EXTRACT(MONTH FROM sale_date) IN (${months.join(',')})`);
    } else if (sale_month) {
      saleDateConditions.push(`EXTRACT(MONTH FROM sale_date) = ${parseInt(sale_month)}`);
    }
    if (saleDateConditions.length > 1) {
      where.id = { [Op.in]: sequelize.literal(`(SELECT DISTINCT service_agreement_id FROM income WHERE ${saleDateConditions.join(' AND ')})`) };
    }
    const ALLOWED_SORT = ['customer_name', 'service_type', 'status', 'amount_application', 'amount_implementation', 'approval_date', 'createdAt', 'sales_agent'];
    const sf = ALLOWED_SORT.includes(sort_field) ? sort_field : 'createdAt';
    const sd = (sort_dir || '').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const { count, rows } = await ServiceAgreement.findAndCountAll({
      where, limit: parseInt(limit), offset: actualOffset,
      order: [[sf, sd]]
    });

    // Enrich agreements with collected income; non-fatal if it fails
    const idMap = new Map();
    const nameMap = new Map();
    try {
      // Primary: match by service_agreement_id (for income records properly linked)
      const byId = await sequelize.query(`
        SELECT service_agreement_id,
               MIN(sale_date) AS first_sale_date,
               COALESCE(SUM(amount_collected), 0) AS total_collected,
               COUNT(*) AS payment_count
        FROM income
        WHERE service_agreement_id IS NOT NULL
        GROUP BY service_agreement_id
      `, { type: QueryTypes.SELECT });
      for (const row of byId) {
        idMap.set(Number(row.service_agreement_id), {
          total: parseFloat(row.total_collected || 0),
          count: parseInt(row.payment_count || 0),
          first_sale_date: row.first_sale_date || null
        });
      }
      // Fallback: match by (customer_name + service_type) for imported data without agreement link
      const byName = await sequelize.query(`
        SELECT LOWER(TRIM(customer_name)) || '|' || COALESCE(LOWER(TRIM(service_type)), '') AS name_svc_key,
               COALESCE(SUM(amount_collected), 0) AS total_collected,
               COUNT(*) AS payment_count
        FROM income
        WHERE customer_name IS NOT NULL
        GROUP BY name_svc_key
      `, { type: QueryTypes.SELECT });
      for (const row of byName) {
        nameMap.set(row.name_svc_key, {
          total: parseFloat(row.total_collected || 0),
          count: parseInt(row.payment_count || 0)
        });
      }
    } catch (enrichErr) {
      console.error('Income enrichment failed (non-fatal):', enrichErr.message);
    }

    const enriched = rows.map(sa => {
      const byIdMatch = idMap.get(sa.id);
      const nameKey = `${(sa.customer_name || '').toLowerCase().trim()}|${(sa.service_type || '').toLowerCase().trim()}`;
      const byNameMatch = nameMap.get(nameKey);
      const inc = byIdMatch || byNameMatch || { total: 0, count: 0, first_sale_date: null };
      return { ...sa.toJSON(), income_collected: inc.total, income_payment_count: inc.count, first_sale_date: inc.first_sale_date };
    });

    res.json({ data: enriched, total: count });

    // Background: auto-update statuses based on collected income
    setImmediate(() => {
      for (const row of enriched) {
        if (COMPLETED_STATUSES.includes(row.status)) continue;
        const application = parseFloat(row.amount_application || 0);
        const collected = parseFloat(row.income_collected || 0);
        if (!row.approval_date) {
          if (collected > 0 && (application === 0 || collected >= application)) {
            ServiceAgreement.update({ status: 'ΑΠΟΠΛΗΡΩΜΗ ΑΙΤΗΣΗΣ' }, { where: { id: row.id } }).catch(() => {});
          }
        } else {
          const target = application + parseFloat(row.amount_implementation || 0);
          if (collected > 0 && (target === 0 || collected >= target)) {
            ServiceAgreement.update({ status: 'ΑΠΟΠΛΗΡΩΜΕΝΕΣ' }, { where: { id: row.id } }).catch(() => {});
          }
        }
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const COMPLETED_STATUSES = ['ΑΠΟΠΛΗΡΩΜΕΝΕΣ', 'ΟΛΟΚΛΗΡΩΜΕΝΕΣ ΕΠΙΤΥΧΩΣ', 'ΟΛΟΚΛΗΡΩΜΕΝΕΣ FAIL'];

async function applyAutoStatus(sa) {
  if (COMPLETED_STATUSES.includes(sa.status)) return;
  const [row] = await sequelize.query(
    `SELECT COALESCE(SUM(amount_collected),0) AS total FROM income WHERE service_agreement_id = :id`,
    { replacements: { id: sa.id }, type: QueryTypes.SELECT }
  );
  const collected = parseFloat(row?.total || 0) || parseFloat(sa.amount_collected_total || 0);
  const application = parseFloat(sa.amount_application || 0);
  if (!sa.approval_date) {
    if (collected > 0 && (application === 0 || collected >= application)) {
      await sa.update({ status: 'ΑΠΟΠΛΗΡΩΜΗ ΑΙΤΗΣΗΣ' });
    }
  } else {
    const target = application + parseFloat(sa.amount_implementation || 0);
    if (collected > 0 && (target === 0 || collected >= target)) {
      await sa.update({ status: 'ΑΠΟΠΛΗΡΩΜΕΝΕΣ' });
    }
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
module.exports.checkAndAutoStatus = checkAndAutoStatus;
