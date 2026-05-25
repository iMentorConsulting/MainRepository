const router = require('express').Router();
const https = require('https');
const axios = require('axios');
const Income = require('../models/Income');

async function aadeSearchAfm(vat, orgKey) {
  const isIke = orgKey === 'IMENTOR_IKE';
  const username = isIke ? (process.env.AADE_USER_IMENTOR || '') : (process.env.AADE_USER || '');
  const password = isIke ? (process.env.AADE_PASS_IMENTOR || '') : (process.env.AADE_PASS || '');
  const myAfm   = isIke ? (process.env.MY_AFM_IMENTOR  || '') : (process.env.MY_AFM  || '');

  const soapBody = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:pub="http://rgwspublic2.rg.gov.gr/"><soapenv:Header/><soapenv:Body><pub:rgWsPublic2AfmMethod><pub:INPUT_REC><pub:afm_called_by>${myAfm}</pub:afm_called_by><pub:afm_called_for>${vat}</pub:afm_called_for></pub:INPUT_REC></pub:rgWsPublic2AfmMethod></soapenv:Body></soapenv:Envelope>`;

  const bodyBuffer = Buffer.from(soapBody, 'utf8');
  const credentials = Buffer.from(`${username}:${password}`).toString('base64');

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'www1.gsis.gr',
      path: '/wsaade/RgWsPublic2/RgWsPublic2',
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml;charset=UTF-8',
        'SOAPAction': '""',
        'Authorization': `Basic ${credentials}`,
        'Content-Length': Buffer.byteLength(bodyBuffer),
      },
    };
    const req = https.request(options, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const xml = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode !== 200) {
          return reject(new Error(`GSIS HTTP ${res.statusCode}: ${xml.substring(0, 500)}`));
        }
        const get = tag => {
          const m = xml.match(new RegExp(`<[^:>]*:?${tag}>([^<]*)<`));
          return m ? m[1].trim() : null;
        };
        const errorCode = get('error_code');
        if (errorCode && errorCode !== 'RET_CODE_OK' && errorCode !== '') {
          return resolve({ error: get('error_descr') || `Error: ${errorCode}` });
        }
        resolve({
          name: get('onomasia'),
          address: get('postal_address'),
          city: get('postal_address_city'),
          postal_code: get('postal_zip_code'),
          vat: get('afm'),
          activity: get('activity_descr'),
          legal_status: get('legal_status_descr')
        });
      });
    });
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('GSIS request timeout')); });
    req.on('error', reject);
    req.end(bodyBuffer);
  });
}

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
    email: income.email ? [{ email: income.email, primary: true }] : [],
    addresses: income.address ? [{
      address: income.address,
      city: income.city || '',
      zip: income.postal_code || '',
      country: 'GR'
    }] : [],
    is_client: true,
  });
  return c.data.id;
}

const vatTaxRateCache = {};

async function getVatTaxRateId(orgKey) {
  // Allow manual override via env variable (set after checking /api/invoices/tax-rates)
  const envId = orgKey === 'IMENTOR_IKE' ? process.env.ELORUS_VAT_RATE_ID_IKE : process.env.ELORUS_VAT_RATE_ID;
  if (envId) return envId;
  if (vatTaxRateCache[orgKey]) return vatTaxRateCache[orgKey];

  // Try all known Elorus tax endpoints (endpoint names vary by account/version)
  for (const ep of ['itemtaxes/', 'itemtaxes/?active=true', 'taxes/', 'taxes/?active=true', 'taxratecategories/', 'taxrates/']) {
    try {
      const r = await api(orgKey).get(ep);
      const items = r.data.results || (Array.isArray(r.data) ? r.data : []);
      if (!items.length) { console.log(`Elorus ${ep}: empty`); continue; }
      console.log(`Elorus ${ep} (${items.length}):`, JSON.stringify(items).slice(0, 400));
      // Find 24% VAT; fall back to first entry
      const vat24 = items.find(t =>
        parseFloat(t.percent || t.rate || t.tax_percent || 0) === 24 ||
        (t.title || t.name || t.label || '').includes('24')
      );
      const chosen = vat24 || items[0];
      // Handle nested taxrate object or direct id
      let id = chosen.id;
      if (!id && chosen.taxrate) {
        id = typeof chosen.taxrate === 'object' ? chosen.taxrate.id : chosen.taxrate;
      }
      if (id) { vatTaxRateCache[orgKey] = id; return id; }
    } catch (e) {
      if (e.response?.status !== 404) console.warn(`Elorus ${ep}:`, e.message);
    }
  }

  // Last resort: extract tax id from an existing Elorus invoice
  try {
    const r = await api(orgKey).get('invoices/?page_size=5');
    const invs = r.data.results || [];
    for (const inv of invs) {
      const taxId = inv.items?.[0]?.taxes?.[0];
      if (taxId != null) {
        const id = typeof taxId === 'object' ? taxId.id : taxId;
        if (id) { console.log('Elorus: tax rate from existing invoice:', id); vatTaxRateCache[orgKey] = id; return id; }
      }
    }
  } catch (e) { console.warn('Elorus invoice fallback:', e.message); }

  return null;
}

function lines(net, desc, serviceType, taxRateId) {
  // Elorus v1.1: taxes is an array of plain integer IDs
  const taxes = taxRateId ? [taxRateId] : [];
  return [{
    title: desc || serviceType || 'Παροχή Υπηρεσιών',
    quantity: '1.00',
    unit_value: net.toFixed(2),
    discount: '0.00',
    ...(taxes.length ? { taxes } : {}),
  }];
}

function withholding(net, orgKey) {
  if (orgKey === 'IMENTOR_IKE') return [];
  if (net <= 301) return [];
  return [{ value: (-net * 0.20).toFixed(2), title: 'Παρακράτηση 20%' }];
}

function errMsg(e) {
  return e.response?.data ? JSON.stringify(e.response.data) : e.message;
}

router.get('/tax-rates', async (req, res) => {
  try {
    const orgKey = req.query.org_key || 'DEFAULT';
    const out = {};
    for (const ep of ['itemtaxes/', 'itemtaxes/?active=true', 'taxes/', 'taxratecategories/', 'taxrates/']) {
      try { out[ep] = (await api(orgKey).get(ep)).data; }
      catch (e) { out[ep] = { error: e.message }; }
    }
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/search-afm', async (req, res) => {
  try {
    const { income_id, org_key = 'DEFAULT' } = req.query;
    const income = await Income.findByPk(income_id);
    if (!income) return res.status(404).json({ error: 'Εγγραφή δεν βρέθηκε' });
    if (!income.vat_number) return res.json({ error: 'Δεν υπάρχει ΑΦΜ σε αυτή την εγγραφή' });
    const result = await aadeSearchAfm(income.vat_number.trim(), org_key);
    res.json(result);
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

router.post('/create-draft', async (req, res) => {
  try {
    const { income_id, org_key = 'DEFAULT', amount, description, date, document_type = 1 } = req.body;
    const income = await Income.findByPk(income_id);
    if (!income) return res.status(404).json({ error: 'Εγγραφή δεν βρέθηκε' });
    const a = api(org_key);
    const net = parseFloat(amount);
    const [taxRateId, contactId] = await Promise.all([getVatTaxRateId(org_key), findOrCreateContact(org_key, income)]);
    if (!taxRateId) {
      let debug = '?';
      try { debug = JSON.stringify((await api(org_key).get('taxratecategories/')).data).slice(0, 300); } catch (de) { debug = de.message; }
      return res.status(400).json({ error: `Elorus: δεν βρέθηκε VAT rate ID. Ορίστε ELORUS_VAT_RATE_ID στο Railway. taxratecategories: ${debug}` });
    }
    const body = {
      client: contactId,
      date: date || new Date().toISOString().split('T')[0],
      document_type: parseInt(document_type) || 1,
      mydata_document_type: req.body.mydata_document_type || '2.1',
      draft: true,
      items: lines(net, description, income.service_type, taxRateId),
      ...(withholding(net, org_key).length ? { extra_fees: withholding(net, org_key) } : {}),
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
    const { income_id, org_key = 'DEFAULT', amount, description, date, payment_method_id, document_type = 1 } = req.body;
    const income = await Income.findByPk(income_id);
    if (!income) return res.status(404).json({ error: 'Εγγραφή δεν βρέθηκε' });
    const a = api(org_key);
    const net = parseFloat(amount);
    const iDate = date || new Date().toISOString().split('T')[0];
    const [taxRateId, contactId] = await Promise.all([getVatTaxRateId(org_key), findOrCreateContact(org_key, income)]);
    if (!taxRateId) {
      let debug = '?';
      try { debug = JSON.stringify((await api(org_key).get('taxratecategories/')).data).slice(0, 300); } catch (de) { debug = de.message; }
      return res.status(400).json({ error: `Elorus: δεν βρέθηκε VAT rate ID. Ορίστε ELORUS_VAT_RATE_ID στο Railway. taxratecategories: ${debug}` });
    }
    const body = {
      client: contactId,
      date: iDate,
      document_type: parseInt(document_type) || 1,
      mydata_document_type: req.body.mydata_document_type || '2.1',
      items: lines(net, description, income.service_type, taxRateId),
      ...(withholding(net, org_key).length ? { extra_fees: withholding(net, org_key) } : {}),
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
