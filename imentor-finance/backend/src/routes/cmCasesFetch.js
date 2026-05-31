const router = require('express').Router();
const axios = require('axios');
const ServiceAgreement = require('../models/ServiceAgreement');

// GET /api/cm-cases/fetch — pull cases from consult.i-mentor.gr and return them
// GET /api/cm-cases/preview — same pull but returns raw CM data for review before applying
// POST /api/cm-cases/apply — write CM dates/status back to matching service agreements
// Requires: CM_APP_URL and FINANCE_API_KEY set in Railway env vars

function getCmClient() {
  const base = process.env.CM_APP_URL;
  const key  = process.env.FINANCE_API_KEY;
  if (!base) throw new Error('CM_APP_URL not configured');
  if (!key)  throw new Error('FINANCE_API_KEY not configured');
  return axios.create({
    baseURL: base.replace(/\/$/, ''),
    headers: { Authorization: `Bearer ${key}` },
    timeout: 15000,
  });
}

// Normalise strings for matching: lowercase + trim + collapse spaces
const norm = s => (s || '').toLowerCase().trim().replace(/\s+/g, ' ');

// Match CM case to SA by AFM (preferred) or by normalised client_name
function matchCases(saList, cmCases) {
  const results = [];
  for (const cm of cmCases) {
    const cmAfm  = norm(cm.afm);
    const cmName = norm(cm.client_name);

    let sa = null;
    if (cmAfm) {
      sa = saList.find(s => norm(s.vat_number) === cmAfm && norm(s.service_type) === norm(cm.service_type));
      if (!sa) sa = saList.find(s => norm(s.vat_number) === cmAfm);
    }
    if (!sa && cmName) {
      sa = saList.find(s => norm(s.customer_name) === cmName && norm(s.service_type) === norm(cm.service_type));
      if (!sa) sa = saList.find(s => norm(s.customer_name) === cmName);
    }

    results.push({
      cm_id:              cm.id,
      cm_name:            cm.client_name,
      cm_afm:             cm.afm,
      cm_service:         cm.service_type,
      cm_status:          cm.status,
      cm_approval_date:   cm.approval_date,
      cm_deadline:        cm.project_deadline,
      finance_id:         sa?.id || null,
      finance_name:       sa?.customer_name || null,
      finance_service:    sa?.service_type || null,
      finance_approval:   sa?.approval_date || null,
      finance_deadline:   sa?.completion_deadline || null,
      matched:            !!sa,
    });
  }
  return results;
}

// GET /preview — fetch CM data and show matching without writing
router.get('/preview', async (req, res) => {
  try {
    const client = getCmClient();
    const { data } = await client.get('/api/finance-sync/cases');
    const saList = await ServiceAgreement.findAll({ raw: true });
    const matched = matchCases(saList, data.data || []);
    const stats = {
      total_cm:    data.count,
      matched:     matched.filter(r => r.matched).length,
      unmatched:   matched.filter(r => !r.matched).length,
      will_update: matched.filter(r => r.matched && (r.cm_approval_date || r.cm_deadline)).length,
    };
    res.json({ stats, rows: matched });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /apply — write CM dates into matching service agreements
// Body: { field: 'both'|'approval'|'deadline', overwrite: true|false }
router.post('/apply', async (req, res) => {
  try {
    const { field = 'both', overwrite = false } = req.body;
    const client = getCmClient();
    const { data } = await client.get('/api/finance-sync/cases');
    const saList = await ServiceAgreement.findAll();
    const matched = matchCases(saList.map(s => s.toJSON()), data.data || []);

    let updated = 0;
    let skipped = 0;

    for (const row of matched) {
      if (!row.matched) { skipped++; continue; }
      const sa = saList.find(s => s.id === row.finance_id);
      if (!sa) { skipped++; continue; }

      const patch = {};
      const applyApproval = (field === 'both' || field === 'approval') && row.cm_approval_date;
      const applyDeadline  = (field === 'both' || field === 'deadline')  && row.cm_deadline;

      if (applyApproval && (overwrite || !sa.approval_date))
        patch.approval_date = row.cm_approval_date;
      if (applyDeadline && (overwrite || !sa.completion_deadline))
        patch.completion_deadline = row.cm_deadline;

      if (Object.keys(patch).length > 0) {
        await sa.update(patch);
        updated++;
      } else {
        skipped++;
      }
    }

    res.json({ updated, skipped, total: matched.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
