const axios = require('axios');
const { Op } = require('sequelize');
const Income = require('../models/Income');

// Push Income rows as "payments" to Logistis (POST /api/external/finance-payments)
// Requires LOGISTIS_BASE_URL + LOGISTIS_API_KEY env vars.
// targeting_category drives which amounts to send:
//   'ΠΩΛΗΣΗ ΑΙΤΗΣΗΣ'    → application only
//   'ΠΩΛΗΣΗ ΥΛΟΠΟΙΗΣΗΣ' → implementation only
//   anything else        → both (if > 0)

function normalizeBase(url) {
  if (!url) return url;
  const withProtocol = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  return withProtocol.replace(/\/$/, '');
}

function getLogistisClient() {
  const base = normalizeBase(process.env.LOGISTIS_BASE_URL);
  const key = process.env.LOGISTIS_API_KEY;
  if (!base) throw new Error('LOGISTIS_BASE_URL not configured in Railway env vars');
  if (!key) throw new Error('LOGISTIS_API_KEY not configured in Railway env vars');
  return axios.create({
    baseURL: base,
    headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
    timeout: 20000,
  });
}

function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function getIncomeForDate(dateStr) {
  return Income.findAll({ where: { sale_date: dateStr } });
}

async function getIncomeForDateRange(dateFrom, dateTo) {
  return Income.findAll({ where: { sale_date: { [Op.between]: [dateFrom, dateTo] } } });
}

// Splits each Income row into up to 2 payments based on targeting_category.
function buildPayments(rows) {
  const payments = [];
  const skipped = [];
  for (const r of rows) {
    if (!r.vat_number) { skipped.push({ id: r.id, customer_name: r.customer_name, reason: 'Λείπει ΑΦΜ' }); continue; }
    if (!r.service_type) { skipped.push({ id: r.id, customer_name: r.customer_name, reason: 'Λείπει υπηρεσία' }); continue; }
    if (!r.sale_date) { skipped.push({ id: r.id, customer_name: r.customer_name, reason: 'Λείπει ημερομηνία' }); continue; }

    const base = {
      afm: r.vat_number.trim(),
      onomasia: r.customer_name || undefined,
      invoiceNumber: r.invoice_number || undefined,
      service: r.service_type,
      paymentDate: r.sale_date,
      accountant: r.accountant || undefined,
    };

    const cat       = (r.targeting_category || '').trim().toUpperCase();
    const collected = parseFloat(r.amount_collected) || 0;
    const app       = parseFloat(r.amount_application) || 0;
    const impl      = parseFloat(r.amount_implementation) || 0;

    if (cat === 'ΠΩΛΗΣΗ ΑΙΤΗΣΗΣ') {
      // Single payment: collected amount, labelled ΑΙΤΗΣΗ
      if (collected > 0)
        payments.push({ ...base, externalId: `income-${r.id}-application`, amount: Math.round(collected * 100), category: 'ΑΙΤΗΣΗ' });
    } else if (cat === 'ΠΩΛΗΣΗ ΥΛΟΠΟΙΗΣΗΣ') {
      // Single payment: collected amount, labelled ΥΛΟΠΟΙΗΣΗ
      if (collected > 0)
        payments.push({ ...base, externalId: `income-${r.id}-implementation`, amount: Math.round(collected * 100), category: 'ΥΛΟΠΟΙΗΣΗ' });
    } else {
      // No specific category: send each breakdown amount that is > 0
      if (app  > 0) payments.push({ ...base, externalId: `income-${r.id}-application`,    amount: Math.round(app  * 100), category: 'ΑΙΤΗΣΗ'    });
      if (impl > 0) payments.push({ ...base, externalId: `income-${r.id}-implementation`, amount: Math.round(impl * 100), category: 'ΥΛΟΠΟΙΗΣΗ' });
    }
  }
  return { payments, skipped };
}

async function sendBatch(payments) {
  if (!payments.length) return { received: 0, matched: 0, unmatched: 0, errors: [] };
  const client = getLogistisClient();
  const { data } = await client.post('/api/external/finance-payments', { payments });
  return data;
}

async function runDailySync(dateStr) {
  const date = dateStr || yesterdayStr();
  const rows = await getIncomeForDate(date);
  const { payments, skipped } = buildPayments(rows);
  const result = await sendBatch(payments);
  return { dateFrom: date, dateTo: date, sent: payments.length, skipped, result };
}

async function runSyncForRange(dateFrom, dateTo) {
  const rows = await getIncomeForDateRange(dateFrom, dateTo);
  const { payments, skipped } = buildPayments(rows);
  const result = await sendBatch(payments);
  return { dateFrom, dateTo, sent: payments.length, skipped, result };
}

// ── CM push helpers ──────────────────────────────────────────────────────────
// Builds one payment per income row for the CM app (no category split).
function buildCmPayments(rows) {
  const payments = [];
  for (const r of rows) {
    if (!r.vat_number) continue;
    const collected = parseFloat(r.amount_collected) || 0;
    if (collected <= 0) continue;
    payments.push({
      externalId:  `income-${r.id}`,
      afm:         r.vat_number.trim(),
      onomasia:    r.customer_name || undefined,
      invoiceNumber: r.invoice_number || undefined,
      service:     r.service_type || undefined,
      paymentDate: r.sale_date || undefined,
      amount:      Math.round(collected * 100),
    });
  }
  return payments;
}

async function sendBatchToCm(payments) {
  const base = normalizeBase(process.env.CM_APP_URL);
  const key  = process.env.FINANCE_APP_API_KEY;
  if (!base || !key) return null; // silently skip if not configured
  if (!payments.length) return null;
  const client = axios.create({
    baseURL: base,
    headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
    timeout: 15000,
  });
  const { data } = await client.post('/api/external/finance-payments', { payments });
  return data;
}

module.exports = { runDailySync, runSyncForRange, buildPayments, getIncomeForDate, getIncomeForDateRange, yesterdayStr, buildCmPayments, sendBatchToCm };
