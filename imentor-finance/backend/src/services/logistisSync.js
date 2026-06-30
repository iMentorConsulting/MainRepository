const axios = require('axios');
const Income = require('../models/Income');

// Push Income rows as "payments" to Logistis (POST /api/external/finance-payments)
// Requires LOGISTIS_BASE_URL + LOGISTIS_API_KEY env vars.
// amount_application -> category ΑΙΤΗΣΗ, amount_implementation -> category ΥΛΟΠΟΙΗΣΗ.

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

// Splits each Income row into up to 2 payments (application / implementation).
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

    const app = parseFloat(r.amount_application) || 0;
    const impl = parseFloat(r.amount_implementation) || 0;

    if (app > 0) {
      payments.push({ ...base, externalId: `income-${r.id}-application`, amount: Math.round(app * 100), category: 'ΑΙΤΗΣΗ' });
    }
    if (impl > 0) {
      payments.push({ ...base, externalId: `income-${r.id}-implementation`, amount: Math.round(impl * 100), category: 'ΥΛΟΠΟΙΗΣΗ' });
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
  return { date, sent: payments.length, skipped, result };
}

module.exports = { runDailySync, buildPayments, getIncomeForDate, yesterdayStr };
