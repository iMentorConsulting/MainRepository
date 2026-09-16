const router = require('express').Router();
const { Op } = require('sequelize');
const IncomingLead = require('../models/IncomingLead');
const Income = require('../models/Income');
const ServiceAgreement = require('../models/ServiceAgreement');
const authMiddleware = require('../middleware/auth');
const { checkAndAutoStatus } = require('./serviceAgreements');
const { buildCmPayments, sendBatchToCm } = require('../services/logistisSync');
const { runPayrollTargetSync } = require('../services/payrollTargetSync');

// ── Incoming webhook — API key required, no user session ──────────────────────
function requireLeadApiKey(req, res, next) {
  const key = process.env.LEAD_INTAKE_API_KEY;
  if (!key) return res.status(500).json({ error: 'LEAD_INTAKE_API_KEY not configured' });
  if (req.headers['x-api-key'] !== key) return res.status(401).json({ error: 'Invalid API key' });
  next();
}

const NUMERIC = ['amount_collected','amount_application','amount_implementation'];
const DATE_F  = ['sale_date'];

function sanitize(body) {
  const clean = { ...body };
  for (const f of NUMERIC) {
    if (clean[f] === '' || clean[f] === undefined) clean[f] = null;
    else if (clean[f] !== null) clean[f] = parseFloat(clean[f]) || null;
  }
  for (const f of DATE_F) {
    if (!clean[f] || clean[f] === '') clean[f] = null;
  }
  return clean;
}

// POST /api/lead-intake  — called by external systems, no auth middleware
router.post('/', requireLeadApiKey, async (req, res) => {
  try {
    const data = sanitize(req.body);
    const { external_id } = data;

    if (external_id) {
      const existing = await IncomingLead.findOne({ where: { external_id } });
      if (existing) return res.json({ ok: true, id: existing.id, duplicate: true });
    }

    const lead = await IncomingLead.create({ ...data, status: 'pending' });
    return res.status(201).json({ ok: true, id: lead.id });
  } catch (e) {
    console.error('[lead-intake] POST error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/lead-intake  — list pending leads for the UI queue
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { status = 'pending' } = req.query;
    const where = status === 'all' ? {} : { status };
    const leads = await IncomingLead.findAll({ where, order: [['createdAt', 'DESC']] });
    res.json(leads);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/lead-intake/:id  — single lead detail
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const lead = await IncomingLead.findByPk(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Not found' });

    // Suggest matching service agreement
    let suggested_sa = null;
    if (lead.vat_number) {
      suggested_sa = await ServiceAgreement.findOne({
        where: {
          vat_number: lead.vat_number,
          ...(lead.service_type ? { service_type: lead.service_type } : {}),
          status: { [Op.notIn]: ['ΟΛΟΚΛΗΡΩΜΕΝΕΣ ΕΠΙΤΥΧΩΣ', 'ΔΕΝ ΠΡΟΧΩΡΗΣΕ'] }
        },
        order: [['createdAt', 'DESC']]
      });
    }
    res.json({ ...lead.toJSON(), suggested_sa });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/lead-intake/:id/convert  — create Income from this lead
router.post('/:id/convert', authMiddleware, async (req, res) => {
  try {
    const lead = await IncomingLead.findByPk(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Not found' });
    if (lead.status === 'converted') return res.status(409).json({ error: 'Already converted', income_id: lead.income_id });

    // req.body overrides allow the UI to pass user-edited values before converting
    const incomeData = sanitize({
      customer_name:         lead.customer_name,
      vat_number:            lead.vat_number,
      phone:                 lead.phone,
      email:                 lead.email,
      city:                  lead.city,
      address:               lead.address,
      postal_code:           lead.postal_code,
      business_activity:     lead.business_activity,
      service_type:          lead.service_type,
      targeting_category:    lead.targeting_category,
      work_status:           lead.work_status,
      description:           lead.description,
      source_referral:       lead.source_referral,
      sales_agent:           lead.sales_agent,
      amount_collected:      lead.amount_collected,
      amount_application:    lead.amount_application,
      amount_implementation: lead.amount_implementation,
      sale_date:             lead.sale_date || new Date().toISOString().slice(0, 10),
      ...req.body,           // UI overrides take precedence
    });

    // Auto-match ServiceAgreement
    if (!incomeData.service_agreement_id && lead.vat_number) {
      const sa = await ServiceAgreement.findOne({
        where: {
          vat_number: lead.vat_number,
          ...(incomeData.service_type ? { service_type: incomeData.service_type } : {}),
          status: { [Op.notIn]: ['ΟΛΟΚΛΗΡΩΜΕΝΕΣ ΕΠΙΤΥΧΩΣ', 'ΔΕΝ ΠΡΟΧΩΡΗΣΕ'] }
        },
        order: [['createdAt', 'DESC']]
      });
      if (sa) incomeData.service_agreement_id = sa.id;
    }

    const record = await Income.create(incomeData);

    // Fire side-effects
    if (record.service_agreement_id) checkAndAutoStatus(record.service_agreement_id);
    try {
      const payments = buildCmPayments([record]);
      if (payments.length) sendBatchToCm(payments).catch(e => console.warn('[CM push]', e.message));
    } catch (_) {}
    runPayrollTargetSync()
      .then(r => { global._lastPayrollTargetSync = r; })
      .catch(e => console.warn('[payroll-target-sync]', e.message));

    // Mark lead as converted
    await lead.update({ status: 'converted', income_id: record.id, converted_at: new Date() });

    res.json({ ok: true, income_id: record.id, income: record });
  } catch (e) {
    console.error('[lead-intake] convert error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/lead-intake/:id/dismiss
router.post('/:id/dismiss', authMiddleware, async (req, res) => {
  try {
    const lead = await IncomingLead.findByPk(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Not found' });
    await lead.update({ status: 'dismissed', notes: req.body.notes || null });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
