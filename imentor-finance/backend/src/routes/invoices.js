const router = require('express').Router();
const axios = require('axios');
const Income = require('../models/Income');

const BASE = 'https://api.elorus.com/v1.1/';
const ORGS = {
  DEFAULT: process.env.ELORUS_ORG_DEFAULT,
  IMENTOR_IKE: process.env.ELORUS_ORG_IMENTOR_IKE,
};

function api(orgKey) {
  const orgId = ORGS[orgKey] || ORGS.DEFAULT;
  const headers = {
    Authorization: `Token ${process.env.ELORUS_TOKEN}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-Elorus-Organization': orgId,
  };
  return {
    get:  (path, cfg)       => axios.get (`${BASE}${path}`, { ...cfg, headers }),
    post: (path, data, cfg) => axios.post(`${BASE}${path}`, data, { ...cfg, headers }),
  };
}

async function findOrCreateContact(orgKey, income) {
  const a = api(orgKey);
  if (income.vat_number) {
    const r = await a.get(`contacts/?search=${encodeURIComponent(income.vat_number)}`);
    if (r.data.results?.length) return r.data.results[0].id;
  }
  const r = await a.get(`contacts/?search=${encodeURIComponent(income.customer_name)}`);
  if (r.data.results?.length) return r.data.results[0].id;
  const c = await a.post('contacts/', {
    company: income.customer_name,
    vat_number: income.vat_number || '',
    email: income.email || '',
    addresses: income.address ? [{ address: income.address, city: income.city || '', zip: income.postal_code || '' }] : [],
    is_client: true,
  });
  return c.data.id;
}

function lines(net, desc, serviceType) {
  return [{
    title: desc || serviceType || 'Παροχή Υπηρεσιών',
    quantity: '1.00',
    unit_value: net.toFixed(2),
    vat_rate: '24.00',
    discount: '0.00',
  }];
}

function withholding(net) {
  return [{ value: (-net * 0.20).toFixed(2), title: 'Παρακράτηση 20%' }];
}

function errMsg(e) {
  return e.response?.data ? JSON.stringify(e.response.data) : e.message;
}

router.get('/search-afm', async (req, res) => {
  try {
    const { income_id, org_key = 'DEFAULT' } = req.query;
    const income = await Income.findByPk(income_id);
    if (!income) return res.status(404).json({ error: 'Εγγραφή δεν βρέθηκε' });
    const term = income.vat_number || income.customer_name;
    const r = await api(org_key).get(`contacts/?search=${encodeURIComponent(term)}`);
    res.json({ contacts: r.data.results || [], vat_number: income.vat_number });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

router.post('/create-draft', async (req, res) => {
  try {
    const { income_id, org_key = 'DEFAULT', amount, description, date } = req.body;
    const income = await Income.findByPk(income_id);
    if (!income) return res.status(404).json({ error: 'Εγγραφή δεν βρέθηκε' });
    const a = api(org_key);
    const net = parseFloat(amount) / 1.24;
    const contactId = await findOrCreateContact(org_key, income);
    const body = {
      client: contactId,
      date: date || new Date().toISOString().split('T')[0],
      document_type: 1,
      draft: true,
      lines: lines(net, description, income.service_type),
      ...(org_key !== 'IMENTOR_IKE' ? { extra_fees: withholding(net) } : {}),
    };
    const r = await a.post('invoices/', body);
    await income.update({ elorus_invoice_id: String(r.data.id) });
    res.json({ success: true, invoice: r.data });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

router.post('/send-to-self', async (req, res) => {
  try {
    const { income_id, org_key = 'DEFAULT' } = req.body;
    const income = await Income.findByPk(income_id);
    if (!income?.elorus_invoice_id) return res.status(400).json({ error: 'Δεν υπάρχει draft τιμολόγιο' });
    await api(org_key).post(`invoices/${income.elorus_invoice_id}/mail/`, {
      recipients: [process.env.GMAIL_USER],
      subject: `[Draft] ΤΠΥ - ${income.customer_name}`,
      message: 'Draft για έλεγχο πριν την οριστική έκδοση.',
    });
    res.json({ success: true, sent_to: process.env.GMAIL_USER });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

router.post('/finalize-and-send', async (req, res) => {
  try {
    const { income_id, org_key = 'DEFAULT' } = req.body;
    const income = await Income.findByPk(income_id);
    if (!income?.elorus_invoice_id) return res.status(400).json({ error: 'Δεν υπάρχει draft τιμολόγιο' });
    const a = api(org_key);
    const fr = await a.post(`invoices/${income.elorus_invoice_id}/finalize/`, {});
    const inv = fr.data;
    const invoiceNumber = `Νο.${inv.number} / ${inv.date}`;
    const recipients = [...new Set([income.email, income.accountant_email].filter(Boolean))];
    if (recipients.length) {
      await a.post(`invoices/${income.elorus_invoice_id}/mail/`, {
        recipients,
        subject: `Τιμολόγιο Νο.${inv.number}`,
        message: 'Σας αποστέλλουμε το τιμολόγιο παροχής υπηρεσιών.',
      });
    }
    await income.update({ invoice_number: invoiceNumber });
    res.json({ success: true, invoice_number: invoiceNumber, invoice: inv });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

router.post('/one-shot', async (req, res) => {
  try {
    const { income_id, org_key = 'DEFAULT', amount, description, date, payment_method_id } = req.body;
    const income = await Income.findByPk(income_id);
    if (!income) return res.status(404).json({ error: 'Εγγραφή δεν βρέθηκε' });
    const a = api(org_key);
    const net = parseFloat(amount) / 1.24;
    const iDate = date || new Date().toISOString().split('T')[0];
    const contactId = await findOrCreateContact(org_key, income);
    const body = {
      client: contactId,
      date: iDate,
      document_type: 1,
      lines: lines(net, description, income.service_type),
      ...(org_key !== 'IMENTOR_IKE' ? { extra_fees: withholding(net) } : {}),
    };
    const cr = await a.post('invoices/', body);
    const inv = cr.data;
    const invoiceNumber = `Νο.${inv.number} / ${inv.date}`;
    const recipients = [...new Set([income.email, income.accountant_email, process.env.GMAIL_USER].filter(Boolean))];
    if (recipients.length) {
      try { await a.post(`invoices/${inv.id}/mail/`, { recipients, subject: `Τιμολόγιο Νο.${inv.number}`, message: 'Σας αποστέλλουμε το τιμολόγιο παροχής υπηρεσιών.' }); }
      catch (err) { console.warn('mail failed:', err.message); }
    }
    if (payment_method_id) {
      try { await a.post(`invoices/${inv.id}/recordpayment/`, { date: iDate, amount: parseFloat(amount).toFixed(2), payment_mode: payment_method_id }); }
      catch (err) { console.warn('payment failed:', err.message); }
    }
    await income.update({ invoice_number: invoiceNumber, elorus_invoice_id: String(inv.id) });
    res.json({ success: true, invoice_number: invoiceNumber, invoice: inv });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

router.post('/record-payment', async (req, res) => {
  try {
    const { income_id, org_key = 'DEFAULT', amount, date, payment_method_id } = req.body;
    const income = await Income.findByPk(income_id);
    if (!income?.elorus_invoice_id) return res.status(400).json({ error: 'Δεν υπάρχει τιμολόγιο Elorus' });
    const r = await api(org_key).post(`invoices/${income.elorus_invoice_id}/recordpayment/`, {
      date: date || new Date().toISOString().split('T')[0],
      amount: parseFloat(amount).toFixed(2),
      payment_mode: payment_method_id,
    });
    res.json({ success: true, payment: r.data });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

router.get('/payment-methods', async (req, res) => {
  try {
    const r = await api(req.query.org_key || 'DEFAULT').get('paymentmethods/?active=true');
    res.json(r.data.results || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
