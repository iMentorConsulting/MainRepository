const router = require('express').Router();
const { Op } = require('sequelize');
const IncomingLead = require('../models/IncomingLead');
const Income = require('../models/Income');
const ServiceAgreement = require('../models/ServiceAgreement');
const authMiddleware = require('../middleware/auth');
const { checkAndAutoStatus } = require('./serviceAgreements');
const { buildCmPayments, sendBatchToCm } = require('../services/logistisSync');
const { runPayrollTargetSync } = require('../services/payrollTargetSync');
const { aadeSearchAfm } = require('./customers');

// ── API key guard ──────────────────────────────────────────────────────────────
function requireLeadApiKey(req, res, next) {
  const key = process.env.LEAD_INTAKE_API_KEY;
  if (!key) return res.status(500).json({ error: 'LEAD_INTAKE_API_KEY not configured' });
  if (req.headers['x-api-key'] !== key) return res.status(401).json({ error: 'Invalid API key' });
  next();
}

// ── Agent name normalisation ───────────────────────────────────────────────────
const ACCENT_MAP = {
  'ά':'α','έ':'ε','ή':'η','ί':'ι','ό':'ο','ύ':'υ','ώ':'ω',
  'Ά':'Α','Έ':'Ε','Ή':'Η','Ί':'Ι','Ό':'Ο','Ύ':'Υ','Ώ':'Ω',
  'ϊ':'ι','ΐ':'ι','ϋ':'υ','ΰ':'υ','Ϊ':'Ι','Ϋ':'Υ',
};
function normalizeGreek(s) {
  return (s || '').replace(/[άέήίόύώΆΈΉΊΌΎΏϊΐϋΰΪΫ]/g, c => ACCENT_MAP[c] || c).toUpperCase();
}

const AGENT_NAMES = ['ΧΡΗΣΤΟΣ', 'ΕΛΕΥΘΕΡΙΑ', 'ΣΟΦΙΑ', 'ΒΑΛΛΙΑ', 'ΣΤΕΛΛΑ', 'ΧΑΡΗΣ'];

function normalizeAgent(raw) {
  if (!raw) return raw;
  const up = normalizeGreek(raw);
  for (const name of AGENT_NAMES) {
    if (up.includes(name)) return name;
  }
  return raw;
}

// ── Field sanitisers ───────────────────────────────────────────────────────────
const NUMERIC = ['amount_collected','amount_application','amount_implementation','vat_amount','bonus'];
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

// ── Field-name normalisation (handles different naming conventions from external apps) ─
function normalizeFieldNames(raw) {
  // Lowercase all keys first so AFM, Phone, Email etc. all match aliases below
  const d = {};
  for (const [k, v] of Object.entries(raw || {})) {
    d[k.toLowerCase()] = v;
  }

  // customer_name aliases
  if (!d.customer_name) d.customer_name = d.client_name || d.name || d.client || d.onomasia || d.pelatis || null;

  // vat_number aliases
  if (!d.vat_number) d.vat_number = d.client_vat || d.afm || d.tax_id || d.tax_number || null;

  // phone aliases
  if (!d.phone) d.phone = d.client_phone || d.mobile || d.tel || d.thl || d.telephone || d.kinito || null;

  // email aliases
  if (!d.email) d.email = d.client_email || d.email_address || d.mail || null;

  // sales_agent aliases
  if (!d.sales_agent) d.sales_agent = d.sent_by || null;

  // vat_amount aliases
  if (!d.vat_amount) d.vat_amount = d.fpa || d.vat || d.tax_amount || d.fpa_amount || null;

  // amount_collected aliases
  if (!d.amount_collected) d.amount_collected = d.amount || d.poso || d.collected || null;

  // source_referral aliases
  if (!d.source_referral) d.source_referral = d.referral || d.source || d.pigi || null;

  // Extract postal_code embedded in address like "ΔΟΛΙΑΝΩΝ 10 ΤΚ:12242" or "ΤΚ 12242"
  if (!d.postal_code && d.address) {
    const tkMatch = d.address.match(/\bΤ\.?Κ\.?[: ]?(\d{5})\b/i);
    if (tkMatch) {
      d.postal_code = tkMatch[1];
      d.address = d.address.replace(tkMatch[0], '').trim().replace(/\s{2,}/g, ' ');
    }
  }

  return d;
}

// ── POST /api/lead-intake  — called by external systems ───────────────────────
router.post('/', requireLeadApiKey, async (req, res) => {
  try {
    const data = sanitize(normalizeFieldNames(req.body));
    const { external_id } = data;

    // Idempotency: return existing income if already processed
    if (external_id) {
      const existing = await IncomingLead.findOne({ where: { external_id } });
      if (existing) return res.json({ ok: true, income_id: existing.income_id, duplicate: true });
    }

    // Normalise agent name for both agent fields
    const agentRaw = data.sales_agent || data.folder_agent;
    const agent = normalizeAgent(agentRaw);

    // Fetch AADE data when VAT is present
    let aadeData = {};
    if (data.vat_number) {
      try {
        const r = await aadeSearchAfm(data.vat_number);
        if (r && !r.error) {
          aadeData = {
            customer_name:     r.name        || undefined,
            address:           r.address     || undefined,
            city:              r.city        || undefined,
            postal_code:       r.postal_code || undefined,
            business_activity: r.activity    || undefined,
          };
        } else if (r && r.error) {
          console.warn('[lead-intake] AADE warn:', r.error);
        }
      } catch (aadeErr) {
        console.warn('[lead-intake] AADE call failed:', aadeErr.message);
      }
    }

    // Merge: webhook data as base; AADE always wins for official fields
    const merged = {
      ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== null && v !== '' && v !== undefined)),
    };
    // AADE official data overrides whatever the external system sent
    if (aadeData.customer_name) merged.customer_name = aadeData.customer_name;
    if (aadeData.address)       merged.address        = aadeData.address;
    if (aadeData.city)          merged.city           = aadeData.city;
    if (aadeData.postal_code)   merged.postal_code    = aadeData.postal_code;
    if (aadeData.business_activity) merged.business_activity = aadeData.business_activity;

    // Set both agent fields from the normalised name
    if (agent) {
      merged.sales_agent  = agent;
      merged.folder_agent = agent;
    }

    merged.sale_date = merged.sale_date || new Date().toISOString().slice(0, 10);

    // Auto-calculate vat_amount if not provided (24% standard rate)
    if (!merged.vat_amount && merged.amount_collected) {
      merged.vat_amount = parseFloat((merged.amount_collected * 0.24).toFixed(2));
    }

    // Auto-calculate bonus for ΠΩΛΗΣΗ ΑΙΤΗΣΗΣ (5% of amount_collected)
    if (!merged.bonus && merged.targeting_category === 'ΠΩΛΗΣΗ ΑΙΤΗΣΗΣ' && merged.amount_collected) {
      merged.bonus = parseFloat((merged.amount_collected * 0.05).toFixed(2));
    }

    // Auto-match ServiceAgreement
    if (!merged.service_agreement_id && merged.vat_number) {
      const sa = await ServiceAgreement.findOne({
        where: {
          vat_number: merged.vat_number,
          ...(merged.service_type ? { service_type: merged.service_type } : {}),
          status: { [Op.notIn]: ['ΟΛΟΚΛΗΡΩΜΕΝΕΣ ΕΠΙΤΥΧΩΣ', 'ΔΕΝ ΠΡΟΧΩΡΗΣΕ'] },
        },
        order: [['createdAt', 'DESC']],
      });
      if (sa) merged.service_agreement_id = sa.id;
    }

    // Create Income record immediately
    const incomeData = sanitize(merged);
    // Remove fields that don't exist on Income model
    delete incomeData.external_id;
    delete incomeData.source;

    const record = await Income.create(incomeData);

    // Log for audit / idempotency
    const lead = await IncomingLead.create({
      external_id:  external_id || null,
      source:       data.source || null,
      status:       'converted',
      income_id:    record.id,
      converted_at: new Date(),
      customer_name: merged.customer_name,
      vat_number:   merged.vat_number,
      sales_agent:  agent || null,
      raw_payload:  req.body,           // store verbatim for debugging
    });

    // Fire side-effects
    if (record.service_agreement_id) checkAndAutoStatus(record.service_agreement_id);
    try {
      const payments = buildCmPayments([record]);
      if (payments.length) sendBatchToCm(payments).catch(e => console.warn('[CM push]', e.message));
    } catch (_) {}
    runPayrollTargetSync()
      .then(r => { global._lastPayrollTargetSync = r; })
      .catch(e => console.warn('[payroll-target-sync]', e.message));

    return res.status(201).json({ ok: true, income_id: record.id });
  } catch (e) {
    console.error('[lead-intake] POST error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/lead-intake  — audit log for the UI ──────────────────────────────
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { status = 'all', limit = 100 } = req.query;
    const where = status === 'all' ? {} : { status };
    const leads = await IncomingLead.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit, 10),
    });
    res.json(leads);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/lead-intake/:id/raw  — raw payload for debugging ─────────────────
router.get('/:id/raw', authMiddleware, async (req, res) => {
  try {
    const lead = await IncomingLead.findByPk(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Not found' });
    res.json({ id: lead.id, source: lead.source, createdAt: lead.createdAt, raw_payload: lead.raw_payload });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
