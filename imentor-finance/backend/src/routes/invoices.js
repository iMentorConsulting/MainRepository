const router = require('express').Router();
const axios = require('axios');
const Income = require('../models/Income');

const ELORUS_API = 'https://api.elorus.com/v1.1/';
const TOKEN = process.env.ELORUS_TOKEN;
const ORGS = {
  DEFAULT: process.env.ELORUS_ORG_DEFAULT,
  IMENTOR_IKE: process.env.ELORUS_ORG_IMENTOR_IKE
};

function elorusHeaders(orgId) {
  return {
    Authorization: `Token ${TOKEN}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-Elorus-Organization': orgId
  };
}

async function findOrCreateContact(orgId, data) {
  const { customer_name, vat_number, email, address, city, postal_code } = data;
  const searchResp = await axios.get(`${ELORUS_API}contacts/?search=${encodeURIComponent(customer_name)}`, {
    headers: elorusHeaders(orgId)
  });
  const results = searchResp.data.results || [];
  if (results.length > 0) return results[0].id;

  const body = {
    company: customer_name,
    vat_number,
    email,
    addresses: address ? [{ address, city, zip: postal_code }] : [],
    is_client: true
  };
  const createResp = await axios.post(`${ELORUS_API}contacts/`, body, { headers: elorusHeaders(orgId) });
  return createResp.data.id;
}

// POST /api/invoices/create  — create invoice in Elorus for an income record
router.post('/create', async (req, res) => {
  try {
    const { income_id, org_key, amount, description, date } = req.body;
    const orgId = ORGS[org_key] || ORGS.DEFAULT;
    const withholding = (org_key === 'IMENTOR_IKE') ? false : true;

    const income = await Income.findByPk(income_id);
    if (!income) return res.status(404).json({ error: 'Εγγραφή εσόδου δεν βρέθηκε' });

    const contactId = await findOrCreateContact(orgId, income);

    const net = parseFloat(amount) / 1.24;
    const vatAmount = parseFloat(amount) - net;

    const invoiceBody = {
      client: contactId,
      date: date || new Date().toISOString().split('T')[0],
      document_type: 1,
      lines: [{
        title: description || income.description || income.service_type,
        quantity: '1.00',
        unit_value: net.toFixed(2),
        vat_rate: '24.00',
        discount: '0.00'
      }],
      ...(withholding ? { extra_fees: [{ value: (-net * 0.20).toFixed(2), title: 'Παρακράτηση 20%' }] } : {})
    };

    const resp = await axios.post(`${ELORUS_API}invoices/`, invoiceBody, { headers: elorusHeaders(orgId) });
    const invoice = resp.data;
    const invoiceNumber = `Νο.${invoice.number} / ${invoice.date}`;

    await income.update({
      invoice_number: invoiceNumber,
      elorus_invoice_id: String(invoice.id)
    });

    res.json({ invoice, invoice_number: invoiceNumber });
  } catch (e) {
    const msg = e.response?.data ? JSON.stringify(e.response.data) : e.message;
    res.status(500).json({ error: msg });
  }
});

// GET /api/invoices/pdf/:income_id  — get PDF URL from Elorus
router.get('/pdf/:income_id', async (req, res) => {
  try {
    const income = await Income.findByPk(req.params.income_id);
    if (!income || !income.elorus_invoice_id) return res.status(404).json({ error: 'Δεν υπάρχει τιμολόγιο' });
    const orgId = ORGS.DEFAULT;
    const resp = await axios.get(`${ELORUS_API}invoices/${income.elorus_invoice_id}/`, { headers: elorusHeaders(orgId) });
    res.json({ pdf_url: resp.data.pdf_url, invoice: resp.data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
