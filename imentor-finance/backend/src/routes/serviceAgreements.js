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
        await sa.update({ status: 'ΟΛΟΚΛΗΡΩΜΕΝΕΣ ΕΠΙΤΥΧΩΣ' });
      }
    }
  } catch (e) {
    console.error('checkAndAutoStatus failed:', e.message);
  }
}

// ── GET /pivot — service × status cross-tab ──────────────────────────────────
router.get('/pivot', async (req, res) => {
  try {
    const rows = await sequelize.query(`
      SELECT
        COALESCE(NULLIF(TRIM(service_type), ''), 'Χωρίς Υπηρεσία') AS service_type,
        COALESCE(NULLIF(TRIM(status), ''), 'Χωρίς Κατάσταση') AS status,
        COUNT(*) AS cnt,
        COALESCE(SUM(amount_application), 0) AS sum_application,
        COALESCE(SUM(amount_implementation), 0) AS sum_implementation
      FROM service_agreements
      GROUP BY 1, 2
      ORDER BY 1, 2
    `, { type: QueryTypes.SELECT });
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

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
    const { status, customer_id, customer_name, search, sales_agent, service_type, sale_year, sale_years, sale_month, sale_months, missing_dates, limit = 50, offset = 0, page, sort_field, sort_dir } = req.query;
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
    if (missing_dates === 'true') {
      const missingCond = { [Op.or]: [{ approval_date: null }, { completion_deadline: null }] };
      if (where[Op.or]) {
        where[Op.and] = [{ [Op.or]: where[Op.or] }, missingCond];
        delete where[Op.or];
      } else {
        Object.assign(where, missingCond);
      }
    }
    // Filter by first income sale_date year/month — fully parameterized, no string interpolation
    const saleDateParts = ['service_agreement_id IS NOT NULL'];
    const saleDateReplacements = {};
    const validYear  = n => Number.isInteger(n) && n >= 2000 && n <= 2100;
    const validMonth = n => Number.isInteger(n) && n >= 1    && n <= 12;
    const yearVals = sale_years
      ? sale_years.split(',').map(y => parseInt(y.trim(), 10)).filter(validYear)
      : sale_year ? [parseInt(sale_year, 10)].filter(validYear) : [];
    const monthVals = sale_months
      ? sale_months.split(',').map(m => parseInt(m.trim(), 10)).filter(validMonth)
      : sale_month ? [parseInt(sale_month, 10)].filter(validMonth) : [];
    if (yearVals.length) {
      saleDateParts.push('EXTRACT(YEAR FROM sale_date) IN (:saleYears)');
      saleDateReplacements.saleYears = yearVals;
    }
    if (monthVals.length) {
      saleDateParts.push('EXTRACT(MONTH FROM sale_date) IN (:saleMonths)');
      saleDateReplacements.saleMonths = monthVals;
    }
    if (saleDateParts.length > 1) {
      const incomeIds = await sequelize.query(
        `SELECT DISTINCT service_agreement_id FROM income WHERE ${saleDateParts.join(' AND ')}`,
        { replacements: saleDateReplacements, type: QueryTypes.SELECT }
      );
      const saleFilterIds = incomeIds.map(r => r.service_agreement_id).filter(Boolean);
      where.id = { [Op.in]: saleFilterIds.length ? saleFilterIds : [-1] };
    }
    const ALLOWED_SORT = ['customer_name', 'service_type', 'status', 'amount_application', 'amount_implementation', 'approval_date', 'createdAt', 'sales_agent'];
    const sf = ALLOWED_SORT.includes(sort_field) ? sort_field : 'createdAt';
    const sd = (sort_dir || '').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Run paginated results + aggregate queries in parallel
    const [
      { count, rows },
      saSums,
      statusCounts,
      allIds,
    ] = await Promise.all([
      ServiceAgreement.findAndCountAll({ where, limit: parseInt(limit), offset: actualOffset, order: [[sf, sd]] }),
      ServiceAgreement.findOne({
        where,
        attributes: [
          [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('amount_application')), 0), 'total_application'],
          [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('amount_implementation')), 0), 'total_implementation'],
        ],
        raw: true,
      }),
      ServiceAgreement.findAll({
        where,
        attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'cnt']],
        group: ['status'],
        raw: true,
      }),
      ServiceAgreement.findAll({ where, attributes: ['id'], raw: true }),
    ]);

    // Sum collected income for all filtered agreement IDs
    const filteredIds = allIds.map(r => r.id);
    let totalCollected = 0;
    if (filteredIds.length > 0) {
      const [cr] = await sequelize.query(
        `SELECT COALESCE(SUM(amount_collected), 0) AS total FROM income WHERE service_agreement_id IN (:ids)`,
        { replacements: { ids: filteredIds }, type: QueryTypes.SELECT }
      );
      totalCollected = parseFloat(cr?.total || 0);
    }

    const filteredByStatus = {};
    for (const { status, cnt } of statusCounts) filteredByStatus[status] = parseInt(cnt);

    const sums = {
      application:    parseFloat(saSums?.total_application    || 0),
      implementation: parseFloat(saSums?.total_implementation || 0),
      collected:      totalCollected,
    };

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

    res.json({ data: enriched, total: count, sums, byStatus: filteredByStatus });

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
            ServiceAgreement.update({ status: 'ΟΛΟΚΛΗΡΩΜΕΝΕΣ ΕΠΙΤΥΧΩΣ' }, { where: { id: row.id } }).catch(() => {});
          }
        }
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const COMPLETED_STATUSES = ['ΟΛΟΚΛΗΡΩΜΕΝΕΣ ΕΠΙΤΥΧΩΣ', 'ΟΛΟΚΛΗΡΩΜΕΝΕΣ FAIL'];

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
      await sa.update({ status: 'ΟΛΟΚΛΗΡΩΜΕΝΕΣ ΕΠΙΤΥΧΩΣ' });
    }
  }
}

// ── POST /bulk-dates — mass-set approval_date or completion_deadline ──────────
router.post('/bulk-dates', async (req, res) => {
  try {
    const { ids, field, mode, months, value } = req.body;
    const ALLOWED_FIELDS = ['approval_date', 'completion_deadline'];
    if (!ALLOWED_FIELDS.includes(field)) return res.status(400).json({ error: 'Invalid field' });
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'No ids provided' });

    const safeIds = ids.map(Number).filter(n => Number.isFinite(n) && n > 0);
    const agreements = await ServiceAgreement.findAll({ where: { id: safeIds } });

    let firstSaleDateMap = new Map();
    if (mode === 'months_after_agreement' && safeIds.length > 0) {
      const saleRows = await sequelize.query(
        `SELECT service_agreement_id, MIN(sale_date) AS first_sale_date FROM income WHERE service_agreement_id IN (:ids) GROUP BY service_agreement_id`,
        { replacements: { ids: safeIds }, type: QueryTypes.SELECT }
      );
      for (const row of saleRows) firstSaleDateMap.set(Number(row.service_agreement_id), row.first_sale_date);
    }

    const addMonths = (dateStr, n) => {
      const d = new Date(String(dateStr).replace(/T.*/, '') + 'T00:00:00');
      d.setMonth(d.getMonth() + parseInt(n));
      return d.toISOString().split('T')[0];
    };

    let updated = 0;
    for (const sa of agreements) {
      let dateVal = null;
      if (mode === 'fixed') {
        dateVal = value || null;
      } else if (mode === 'months_after_agreement') {
        const base = firstSaleDateMap.get(sa.id) || sa.createdAt?.toISOString().split('T')[0];
        if (base) dateVal = addMonths(base, months);
      } else if (mode === 'months_after_approval') {
        if (sa.approval_date) dateVal = addMonths(sa.approval_date, months);
      }
      if (dateVal) {
        await sa.update({ [field]: dateVal });
        updated++;
      }
    }

    res.json({ updated, skipped: agreements.length - updated });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

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
