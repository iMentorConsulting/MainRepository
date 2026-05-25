const router = require('express').Router();
const { Op } = require('sequelize');
const Income = require('../models/Income');
const { checkAndAutoStatus } = require('./serviceAgreements');

const ALLOWED_SORT = ['sale_date','customer_name','amount_collected','amount_application','amount_implementation','service_type','sales_agent','work_status','vat_number','bonus'];

router.get('/', async (req, res) => {
  try {
    const { year, month, date_from, date_to, service_type, sales_agent, search, page = 1, limit = 50, sort_field, sort_dir } = req.query;
    const where = {};
    if (date_from && date_to) {
      where.sale_date = { [Op.between]: [date_from, date_to] };
    } else if (date_from) {
      where.sale_date = { [Op.gte]: date_from };
    } else if (date_to) {
      where.sale_date = { [Op.lte]: date_to };
    } else if (year && month) {
      where.sale_date = { [Op.between]: [`${year}-${month.padStart(2,'0')}-01`, `${year}-${month.padStart(2,'0')}-31`] };
    } else if (year) {
      where.sale_date = { [Op.between]: [`${year}-01-01`, `${year}-12-31`] };
    }
    if (service_type) where.service_type = service_type;
    if (sales_agent) where.sales_agent = sales_agent;
    if (search) where.customer_name = { [Op.iLike]: `%${search}%` };

    const sf = ALLOWED_SORT.includes(sort_field) ? sort_field : 'sale_date';
    const sd = sort_dir?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { count, rows } = await Income.findAndCountAll({
      where, order: [[sf, sd], ['id', 'DESC']],
      limit: parseInt(limit), offset
    });
    res.json({ total: count, page: parseInt(page), data: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const NUMERIC_FIELDS = ['amount_collected','amount_application','amount_implementation','vat_amount','bonus','investment_height','total_debts'];
const sanitize = body => {
  const clean = { ...body };
  for (const f of NUMERIC_FIELDS) {
    if (clean[f] === '' || clean[f] === undefined) clean[f] = null;
    else if (clean[f] !== null) clean[f] = parseFloat(clean[f]) || null;
  }
  return clean;
};

router.post('/', async (req, res) => {
  try {
    const record = await Income.create(sanitize(req.body));
    if (record.service_agreement_id) checkAndAutoStatus(record.service_agreement_id);
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
