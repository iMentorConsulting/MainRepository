const router = require('express').Router();
const { Op, fn, col } = require('sequelize');
const Income = require('../models/Income');
const { checkAndAutoStatus } = require('./serviceAgreements');
const { buildCmPayments, sendBatchToCm } = require('../services/logistisSync');

function pushToCm(record) {
  const payments = buildCmPayments([record]);
  if (!payments.length) return;
  sendBatchToCm(payments).catch(err => console.warn('[CM push]', err.message));
}

const ALLOWED_SORT = ['sale_date','customer_name','amount_collected','amount_application','amount_implementation','service_type','sales_agent','work_status','vat_number','bonus','createdAt'];

router.get('/', async (req, res) => {
  try {
    const { year, years, month, months, date_from, date_to, service_type, sales_agent, sales_agents, work_status, work_statuses, accountant_email, accountant, search, page = 1, limit = 50, sort_field, sort_dir } = req.query;
    const where = {};

    // Date filtering — normalize year/years and month/months to arrays
    const yearArr  = years  ? years.split(',').map(y => y.trim()).filter(Boolean)
                            : (year  ? [year]  : []);
    const monthArr = months ? months.split(',').map(m => m.trim().padStart(2,'0')).filter(Boolean)
                            : (month ? [month.padStart(2,'0')] : []);

    if (date_from && date_to) {
      where.sale_date = { [Op.between]: [date_from, date_to] };
    } else if (date_from) {
      where.sale_date = { [Op.gte]: date_from };
    } else if (date_to) {
      where.sale_date = { [Op.lte]: date_to };
    } else if (yearArr.length > 0 && monthArr.length > 0) {
      const ranges = [];
      for (const y of yearArr) {
        for (const m of monthArr) {
          const mm = m.padStart(2, '0');
          const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate();
          ranges.push({ [Op.between]: [`${y}-${mm}-01`, `${y}-${mm}-${String(lastDay).padStart(2,'0')}`] });
        }
      }
      where.sale_date = { [Op.or]: ranges };
    } else if (yearArr.length === 1) {
      where.sale_date = { [Op.between]: [`${yearArr[0]}-01-01`, `${yearArr[0]}-12-31`] };
    } else if (yearArr.length > 1) {
      where.sale_date = { [Op.or]: yearArr.map(y => ({ [Op.between]: [`${y}-01-01`, `${y}-12-31`] })) };
    }

    if (service_type) where.service_type = service_type;

    // Multi-agent support
    if (sales_agents) {
      const agentList = sales_agents.split(',').map(a => a.trim()).filter(Boolean);
      if (agentList.length === 1) where.sales_agent = agentList[0];
      else if (agentList.length > 1) where.sales_agent = { [Op.in]: agentList };
    } else if (sales_agent) {
      where.sales_agent = sales_agent;
    }

    // Work status filter
    if (work_statuses) {
      const statusList = work_statuses.split(',').map(s => s.trim()).filter(Boolean);
      if (statusList.length === 1) where.work_status = statusList[0];
      else if (statusList.length > 1) where.work_status = { [Op.in]: statusList };
    } else if (work_status) {
      where.work_status = work_status;
    }

    if (accountant_email) where.accountant_email = accountant_email;
    if (accountant && !accountant_email) {
      const names = accountant.split(',').map(n => n.trim()).filter(Boolean);
      if (names.length === 1) where.accountant = names[0];
      else if (names.length > 1) where.accountant = { [Op.in]: names };
    }
    if (search) {
      where[Op.or] = [
        { customer_name: { [Op.iLike]: `%${search}%` } },
        { vat_number: { [Op.iLike]: `%${search}%` } },
        { phone: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const sf = ALLOWED_SORT.includes(sort_field) ? sort_field : 'sale_date';
    const sd = sort_dir?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const [{ count, rows }, sumResult, byServiceRows] = await Promise.all([
      Income.findAndCountAll({ where, order: [[sf, sd], ['id', 'DESC']], limit: parseInt(limit), offset }),
      Income.findOne({ where, attributes: [[fn('SUM', col('amount_collected')), 'total']], raw: true }),
      Income.findAll({ where, attributes: ['service_type', [fn('SUM', col('amount_collected')), 'sum']], group: ['service_type'], order: [[fn('SUM', col('amount_collected')), 'DESC']], raw: true })
    ]);
    res.json({ total: count, sum: parseFloat(sumResult?.total || 0), by_service: byServiceRows, page: parseInt(page), data: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const NUMERIC_FIELDS = ['amount_collected','amount_application','amount_implementation','vat_amount','bonus','investment_height','total_debts'];
const DATE_FIELDS = ['approval_date', 'completion_deadline', 'sale_date'];
const sanitize = body => {
  const clean = { ...body };
  for (const f of NUMERIC_FIELDS) {
    if (clean[f] === '' || clean[f] === undefined) clean[f] = null;
    else if (clean[f] !== null) clean[f] = parseFloat(clean[f]) || null;
  }
  for (const f of DATE_FIELDS) {
    if (!clean[f] || clean[f] === '') clean[f] = null;
  }
  return clean;
};

router.post('/', async (req, res) => {
  try {
    const record = await Income.create(sanitize(req.body));
    if (record.service_agreement_id) checkAndAutoStatus(record.service_agreement_id);
    pushToCm(record);
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
    await record.update(sanitize(req.body));
    const saId = record.service_agreement_id;
    if (saId) checkAndAutoStatus(saId);
    pushToCm(record);
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
