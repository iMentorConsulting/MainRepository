const router = require('express').Router();
const https = require('https');
const axios = require('axios');
const Income = require('../models/Income');
const { sendViaGmailApi } = require('../utils/gmail');

function xmlEscape(s) {
  return (s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
}

async function aadeSearchAfm(vat, orgKey) {
  const isIke = orgKey === 'IMENTOR_IKE';
  const username = (isIke ? (process.env.AADE_USER_IMENTOR || '') : (process.env.AADE_USER || '')).trim();
  const password = (isIke ? (process.env.AADE_PASS_IMENTOR || '') : (process.env.AADE_PASS || '')).trim();
  const myAfm   = (isIke ? (process.env.MY_AFM_IMENTOR  || '') : (process.env.MY_AFM  || '')).trim();

  console.log(`AADE call: orgKey=${orgKey} user=${username||'EMPTY'} myAfm=${myAfm||'EMPTY'} vat=${vat}`);
  if (!myAfm) return { error: `MY_AFM${isIke ? '_IMENTOR' : ''} env var is not set in Railway` };
  if (!username) return { error: `AADE_USER${isIke ? '_IMENTOR' : ''} env var is not set in Railway` };

  // GSIS requires WS-Security UsernameToken in SOAP Header — NOT HTTP Basic Auth
  const soapBody = `<?xml version="1.0" encoding="UTF-8"?><env:Envelope xmlns:env="http://www.w3.org/2003/05/soap-envelope" xmlns:ns1="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" xmlns:ns2="http://rgwspublic2/RgWsPublic2Service" xmlns:ns3="http://rgwspublic2/RgWsPublic2"><env:Header><ns1:Security><ns1:UsernameToken><ns1:Username>${xmlEscape(username)}</ns1:Username><ns1:Password>${xmlEscape(password)}</ns1:Password></ns1:UsernameToken></ns1:Security></env:Header><env:Body><ns2:rgWsPublic2AfmMethod><ns2:INPUT_REC><ns3:afm_called_by>${xmlEscape(myAfm)}</ns3:afm_called_by><ns3:afm_called_for>${xmlEscape(vat)}</ns3:afm_called_for></ns2:INPUT_REC></ns2:rgWsPublic2AfmMethod></env:Body></env:Envelope>`;

  const bodyBuffer = Buffer.from(soapBody, 'utf8');

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'www1.gsis.gr',
      path: '/wsaade/RgWsPublic2/RgWsPublic2',
      method: 'POST',
      headers: {
        'Content-Type': 'application/soap+xml; charset=utf-8',
        'Content-Length': Buffer.byteLength(bodyBuffer),
      },
    };
    const req = https.request(options, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const xml = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode !== 200) {
          console.error('AADE error XML:', xml.substring(0, 2000));
          return reject(new Error(`GSIS HTTP ${res.statusCode}: ${xml.substring(0, 500)}`));
        }
        const get = tag => {
          const m = xml.match(new RegExp(`<[^:>]*:?${tag}>([^<]*)<`));
          return m ? m[1].trim() : null;
        };
        const errorCode = get('error_code');
        if (errorCode && errorCode !== 'RET_CODE_OK' && errorCode !== '' && errorCode !== 'null') {
          console.error('AADE error XML:', xml.substring(0, 2000));
          return resolve({ error: `[${errorCode}] ${get('error_descr') || ''}` });
        }
        // RgWsPublic2 uses snake_case; primary city field is postal_area_description
        const city = get('postal_area_description')
          || get('postal_address_city') || get('postal_city') || get('postal_city_descr')
          || get('firm_city') || get('firm_city_descr') || get('municipality_descr') || get('municipality') || '';
        const street = get('postal_address') || '';
        const streetNo = get('postal_address_no') || '';
        const address = streetNo ? `${street} ${streetNo}`.trim() : street;
        const legalStatus = (get('legal_status_descr') || '').trim();
        let name = ((get('onomasia') || '').replace(/\s+/g, ' ')).trim();
        // Physical persons (empty legal form) have SURNAME FIRSTNAME PATRONYMIC — strip patronymic
        if (!legalStatus) {
          const parts = name.split(' ');
          if (parts.length >= 3) name = parts.slice(0, -1).join(' ');
        }
        resolve({
          name,
          address,
          city,
          postal_code: get('postal_zip_code'),
          vat: get('afm'),
          activity: get('firm_act_descr') || get('activity_descr'),
          legal_status: legalStatus
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
    get:   (path, cfg)       => axios.get  (`${BASE}${path}`, { ...cfg, headers }),
    post:  (path, data, cfg) => axios.post (`${BASE}${path}`, data, { ...cfg, headers }),
    patch: (path, data, cfg) => axios.patch(`${BASE}${path}`, data, { ...cfg, headers }),
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
    client_type: 1,
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
  for (const ep of ['taxes/', 'taxes/?active=true', 'itemtaxes/', 'taxratecategories/', 'taxrates/']) {
    try {
      const r = await api(orgKey).get(ep);
      const items = r.data.results || (Array.isArray(r.data) ? r.data : []);
      if (!items.length) { console.log(`Elorus ${ep}: empty`); continue; }
      console.log(`Elorus ${ep} (${items.length}):`, JSON.stringify(items).slice(0, 400));
      // Find VAT-type tax at 24% — field is "percentage" in Elorus v1.1
      const vatItems = items.filter(t => t.tax_type === 'vat' || t.operand === '+');
      const vat24 = vatItems.find(t => parseFloat(t.percentage || t.percent || t.rate || 0) === 24)
        || vatItems[0];
      if (vat24?.id) { vatTaxRateCache[orgKey] = vat24.id; return vat24.id; }
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

// Matches the working GAS script: category1_3 + E3_561_003 for ΑΠΥ, E3_561_001 for ΤΠΥ
// mydata_document_type is set at invoice level: "2.1" for ΤΠΥ, nothing for ΑΠΥ
function lines(net, desc, serviceType, taxRateId, kind) {
  const taxes = taxRateId ? [taxRateId] : [];
  const isApy = kind === 'APY';
  return [{
    title: desc || serviceType || 'Παροχή Υπηρεσιών',
    quantity: '1.00',
    unit_value: net.toFixed(2),
    discount: '0.00',
    mydata_classification_category: 'category1_3',
    mydata_classification_type: isApy ? 'E3_561_003' : 'E3_561_001',
    ...(taxes.length ? { taxes } : {}),
  }];
}

function withholding(net, orgKey, kind) {
  if (kind === 'APY') return [];
  if (orgKey === 'IMENTOR_IKE') return [];
  if (net <= 301) return [];
  return [{ value: (-net * 0.20).toFixed(2), title: 'Παρακράτηση 20%' }];
}

const docTypeCache = {};
async function findDocType(orgKey, kind) {
  const cacheKey = `${orgKey}_${kind}`;
  if (docTypeCache[cacheKey]) return docTypeCache[cacheKey];
  const r = await api(orgKey).get('documenttypes/?active=true&page_size=100');
  const all = r.data.results || [];
  console.log(`[doctype] all titles for ${orgKey}:`, all.map(d => d.title));
  const keyword = kind === 'APY' ? 'απόδειξη παροχής' : 'τιμολόγιο παροχής';
  const dt = all.find(d => (d.title || '').toLowerCase().includes(keyword));
  if (!dt) throw new Error(`Δεν βρέθηκε τύπος παραστατικού "${keyword}" (διαθέσιμοι: ${all.map(d => d.title).join(', ')})`);
  const dtId = String(dt.id);
  // Per GAS script: ΤΠΥ → '2.1', ΑΠΥ → null (omitted from invoice body)
  const mydataDocType = kind === 'TPY' ? '2.1' : null;
  console.log(`[doctype ${kind}] id=${dtId} title=${dt.title} mydata=${mydataDocType}`);
  docTypeCache[cacheKey] = { id: dtId, mydataDocType };
  return docTypeCache[cacheKey];
}

function errMsg(e) {
  return e.response?.data ? JSON.stringify(e.response.data) : e.message;
}

async function elorusPostInvoice(orgKey, body) {
  const orgId = ORGS[orgKey] || ORGS.DEFAULT;
  const headers = {
    Authorization: `Token ${process.env.ELORUS_TOKEN}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-Elorus-Organization': orgId,
  };
  // GAS script sends documenttype (no underscore) as string — match that exactly.
  // Only client ID needs integer conversion for precision.
  const jsonStr = JSON.stringify(body).replace(/"client":"(\d{10,})"/g, '"client":$1');
  console.log('[elorus-post] sending JSON:', jsonStr.slice(0, 600));
  try {
    return (await axios.post(`${BASE}invoices/`, jsonStr, { headers })).data;
  } catch (e) {
    // On mydata_document_type error, fetch Elorus OPTIONS to log valid choices
    if (e.response?.data?.mydata_document_type) {
      console.error('[elorus] mydata_document_type error. Fetching OPTIONS to find valid values...');
      try {
        const optR = await axios.options(`${BASE}invoices/`, { headers });
        const postActions = optR.data?.actions?.POST || {};
        const mdtField = postActions?.mydata_document_type;
        console.log('[elorus-options] mydata_document_type field def:', JSON.stringify(mdtField || 'NOT FOUND'));
        console.log('[elorus-options] POST field keys:', Object.keys(postActions).join(', '));
      } catch (optE) {
        console.log('[elorus-options] OPTIONS failed:', optE.response?.status, optE.message);
      }
    }
    throw e;
  }
}

async function elorusPostCashreceipt(orgKey, body) {
  const orgId = ORGS[orgKey] || ORGS.DEFAULT;
  const headers = {
    Authorization: `Token ${process.env.ELORUS_TOKEN}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-Elorus-Organization': orgId,
  };
  // Elorus large integer IDs must be sent as integers, not strings
  const jsonStr = JSON.stringify(body)
    .replace(/"contact":"(\d{10,})"/g, '"contact":$1')
    .replace(/"invoice":"(\d{10,})"/g, '"invoice":$1');
  console.log('[elorus-cashreceipt] sending:', jsonStr.slice(0, 400));
  return (await axios.post(`${BASE}cashreceipts/`, jsonStr, { headers })).data;
}

router.get('/document-types', async (req, res) => {
  try {
    const orgKey = req.query.org_key || 'DEFAULT';
    const r = await api(orgKey).get('documenttypes/?active=true&page_size=100');
    const list = r.data.results || r.data || [];
    res.json(list);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Debug: fetch real ΑΠΥ invoices to see exact mydata_document_type value
router.get('/debug-apy-invoice', async (req, res) => {
  try {
    const orgKey = req.query.org_key || 'DEFAULT';
    // Get the ΑΠΥ doc type id
    const dtR = await api(orgKey).get('documenttypes/?active=true&page_size=100');
    const all = dtR.data.results || [];
    const apyDt = all.find(d => (d.title || '').toLowerCase().includes('απόδειξη παροχής'));
    if (!apyDt) return res.json({ error: 'ΑΠΥ doc type not found', titles: all.map(d => d.title) });
    // Fetch real (non-draft) invoices with this doc type
    const invR = await api(orgKey).get(`invoices/?document_type=${apyDt.id}&page_size=5`);
    const invs = (invR.data.results || []).filter(i => !i.draft);
    invs.forEach(i => console.log('[apy-invoice-full]', JSON.stringify(i)));
    res.json({ docType: apyDt, invoices: invs });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Debug: full doc type detail objects + mydata_document_type on real invoices
router.get('/debug-invoice-fields', async (req, res) => {
  try {
    const orgKey = req.query.org_key || 'DEFAULT';
    const dtR = await api(orgKey).get('documenttypes/?active=true&page_size=100');
    const allDt = dtR.data.results || [];
    const result = { docTypeDetails: {}, invoices: {} };
    for (const dt of allDt.slice(0, 10)) {
      try {
        const detail = (await api(orgKey).get(`documenttypes/${dt.id}/`)).data;
        result.docTypeDetails[dt.title] = detail;
        console.log(`[dt-detail] ${dt.title}:`, JSON.stringify(detail));
      } catch (de) { result.docTypeDetails[dt.title] = { error: de.message }; }
      try {
        const invR = await api(orgKey).get(`invoices/?document_type=${dt.id}&page_size=2`);
        const invs = invR.data.results || [];
        if (invs.length) {
          result.invoices[dt.title] = invs.map(i => ({
            id: String(i.id), number: i.number, draft: i.draft,
            mydata_document_type: i.mydata_document_type,
            items: (i.items || []).map(it => ({
              mydata_classification_category: it.mydata_classification_category,
              mydata_classification_type: it.mydata_classification_type,
            })),
          }));
          console.log(`[inv-fields] ${dt.title}:`, JSON.stringify(result.invoices[dt.title][0]));
        }
      } catch (ie) { result.invoices[dt.title] = { error: ie.message }; }
    }
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/tax-rates', async (req, res) => {
  try {
    const orgKey = req.query.org_key || 'DEFAULT';
    const out = {};
    // Try every plausible Elorus tax endpoint
    for (const ep of [
      '', 'itemtaxes/', 'itemtaxes/?active=true',
      'taxes/', 'taxes/?active=true',
      'taxratecategories/', 'taxratecategories/?active=true',
      'taxrates/', 'taxrates/?active=true',
      'taxtypes/', 'vat/', 'vatrates/',
      'invoices/?page_size=2',
    ]) {
      try {
        const r = await api(orgKey).get(ep);
        out[ep || 'ROOT'] = r.data;
      } catch (e) {
        out[ep || 'ROOT'] = { status: e.response?.status, error: e.message };
      }
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
    const { income_id, org_key = 'DEFAULT', amount, description, date, kind = 'TPY' } = req.body;
    const income = await Income.findByPk(income_id);
    if (!income) return res.status(404).json({ error: 'Εγγραφή δεν βρέθηκε' });
    const a = api(org_key);
    const net = parseFloat(amount);
    const [taxRateId, contactId, docType] = await Promise.all([
      getVatTaxRateId(org_key), findOrCreateContact(org_key, income), findDocType(org_key, kind),
    ]);
    if (!taxRateId) {
      let debug = '?';
      try { debug = JSON.stringify((await api(org_key).get('taxratecategories/')).data).slice(0, 300); } catch (de) { debug = de.message; }
      return res.status(400).json({ error: `Elorus: δεν βρέθηκε VAT rate ID. Ορίστε ELORUS_VAT_RATE_ID στο Railway. taxratecategories: ${debug}` });
    }
    const wh = withholding(net, org_key, kind);
    const zipRaw = (income.postal_code || '').toString().replace(/\D/g, '');
    const zip = zipRaw.length === 4 ? '0' + zipRaw : (zipRaw.length === 5 ? zipRaw : '');
    const body = {
      client: contactId,
      date: date || new Date().toISOString().split('T')[0],
      documenttype: docType.id,
      draft: true,
      currency: 'EUR',
      ...(zip ? { billing_address: { address_line: income.address || '-', city: income.city || '-', zip, country: 'GR' } } : {}),
      items: lines(net, description, income.service_type, taxRateId, kind),
      ...(docType.mydataDocType ? { mydata_document_type: docType.mydataDocType } : {}),
      ...(wh.length ? { extra_fees: wh } : {}),
    };
    console.log(`[create-draft] kind=${kind} docTypeId=${docType.id} mydata=${body.mydata_document_type} classType=${body.items[0]?.mydata_classification_type}`);
    const inv = await elorusPostInvoice(org_key, body);
    await income.update({ elorus_invoice_id: String(inv.id) });
    res.json({ success: true, invoice: inv });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

async function fetchInvoicePdf(orgKey, invoiceId) {
  // Use PDF-specific headers — omit Accept:application/json which breaks binary downloads
  const orgId = ORGS[orgKey] || ORGS.DEFAULT;
  const r = await axios.get(`${BASE}invoices/${invoiceId}/pdf/`, {
    responseType: 'arraybuffer',
    headers: {
      Authorization: `Token ${process.env.ELORUS_TOKEN}`,
      'X-Elorus-Organization': orgId,
    },
  });
  const buf = Buffer.from(r.data);
  if (buf.slice(0, 4).toString() !== '%PDF') {
    throw new Error(`Elorus PDF returned non-PDF content: ${buf.slice(0, 200).toString()}`);
  }
  return buf;
}

router.post('/send-to-self', async (req, res) => {
  try {
    const { income_id, org_key = 'DEFAULT' } = req.body;
    const income = await Income.findByPk(income_id);
    if (!income?.elorus_invoice_id) return res.status(400).json({ error: 'Δεν υπάρχει draft τιμολόγιο' });
    const selfEmail = process.env.SMTP_USER || process.env.GMAIL_USER;
    const pdfBuffer = await fetchInvoicePdf(org_key, income.elorus_invoice_id);
    await sendViaGmailApi(
      selfEmail, selfEmail, null,
      `[Draft] ΤΠΥ - ${income.customer_name}`,
      `<p>Draft τιμολόγιο για <strong>${income.customer_name}</strong>.<br>Ελέγξτε το συνημμένο PDF πριν την οριστική έκδοση.</p>`,
      [{ filename: `draft-${income.customer_name}.pdf`, content: pdfBuffer, mimeType: 'application/pdf' }]
    );
    res.json({ success: true, sent_to: selfEmail });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

router.post('/finalize-and-send', async (req, res) => {
  try {
    const { income_id, org_key = 'DEFAULT' } = req.body;
    const income = await Income.findByPk(income_id);
    if (!income?.elorus_invoice_id) return res.status(400).json({ error: 'Δεν υπάρχει draft τιμολόγιο' });
    const a = api(org_key);
    // Elorus v1.1: finalize by PATCHing draft=false (no /finalize/ endpoint)
    await a.patch(`invoices/${income.elorus_invoice_id}/`, { draft: false });
    const inv = (await a.get(`invoices/${income.elorus_invoice_id}/`)).data;
    const invoiceNumber = `Νο.${inv.number} / ${inv.date}`;
    const fromAddr = process.env.SMTP_USER || process.env.GMAIL_USER;
    const pdfBuffer = await fetchInvoicePdf(org_key, income.elorus_invoice_id);
    const recipients = [...new Set([income.email, income.accountant_email].filter(Boolean))];
    for (const to of recipients) {
      try {
        await sendViaGmailApi(
          fromAddr, to, fromAddr,
          `Τιμολόγιο Νο.${inv.number} – i-Mentor`,
          `<p>Αγαπητέ/ή ${income.customer_name},</p><p>Σας αποστέλλουμε το τιμολόγιο παροχής υπηρεσιών σε μορφή PDF.</p><p>Με εκτίμηση,<br>i-Mentor</p>`,
          [{ filename: `invoice-${inv.number}.pdf`, content: pdfBuffer, mimeType: 'application/pdf' }]
        );
      } catch (mailErr) { console.warn(`finalize-and-send mail to ${to}:`, mailErr.message); }
    }
    await income.update({ invoice_number: invoiceNumber });
    res.json({ success: true, invoice_number: invoiceNumber, invoice: inv });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

router.post('/one-shot', async (req, res) => {
  try {
    const { income_id, org_key = 'DEFAULT', amount, description, date, kind = 'TPY' } = req.body;
    const income = await Income.findByPk(income_id);
    if (!income) return res.status(404).json({ error: 'Εγγραφή δεν βρέθηκε' });
    const a = api(org_key);
    const net = parseFloat(amount);
    const iDate = date || new Date().toISOString().split('T')[0];
    const [taxRateId, contactId, docType] = await Promise.all([
      getVatTaxRateId(org_key), findOrCreateContact(org_key, income), findDocType(org_key, kind),
    ]);
    if (!taxRateId) {
      let debug = '?';
      try { debug = JSON.stringify((await api(org_key).get('taxratecategories/')).data).slice(0, 300); } catch (de) { debug = de.message; }
      return res.status(400).json({ error: `Elorus: δεν βρέθηκε VAT rate ID. Ορίστε ELORUS_VAT_RATE_ID στο Railway. taxratecategories: ${debug}` });
    }
    const wh = withholding(net, org_key, kind);
    const zipRaw = (income.postal_code || '').toString().replace(/\D/g, '');
    const zip = zipRaw.length === 4 ? '0' + zipRaw : (zipRaw.length === 5 ? zipRaw : '');
    const body = {
      client: contactId,
      date: iDate,
      documenttype: docType.id,
      currency: 'EUR',
      ...(zip ? { billing_address: { address_line: income.address || '-', city: income.city || '-', zip, country: 'GR' } } : {}),
      items: lines(net, description, income.service_type, taxRateId, kind),
      ...(docType.mydataDocType ? { mydata_document_type: docType.mydataDocType } : {}),
      ...(wh.length ? { extra_fees: wh } : {}),
    };
    console.log(`[one-shot] kind=${kind} docTypeId=${docType.id} mydata=${body.mydata_document_type} classType=${body.items[0]?.mydata_classification_type}`);
    const inv = await elorusPostInvoice(org_key, body);
    const invoiceNumber = `Νο.${inv.number} / ${inv.date}`;
    const fromAddr = process.env.SMTP_USER || process.env.GMAIL_USER;

    // Send email with PDF via Gmail (same as finalize-and-send)
    try {
      const pdfBuffer = await fetchInvoicePdf(org_key, inv.id);
      const recipients = [...new Set([income.email, income.accountant_email].filter(Boolean))];
      for (const to of recipients) {
        try {
          await sendViaGmailApi(
            fromAddr, to, fromAddr,
            `Τιμολόγιο Νο.${inv.number} – i-Mentor`,
            `<p>Αγαπητέ/ή ${income.customer_name},</p><p>Σας αποστέλλουμε το τιμολόγιο παροχής υπηρεσιών σε μορφή PDF.</p><p>Με εκτίμηση,<br>i-Mentor</p>`,
            [{ filename: `invoice-${inv.number}.pdf`, content: pdfBuffer, mimeType: 'application/pdf' }]
          );
        } catch (mailErr) { console.warn(`one-shot mail to ${to}:`, mailErr.message); }
      }
    } catch (pdfErr) { console.warn('one-shot PDF fetch:', pdfErr.message); }

    // Record payment via cashreceipts (same as GAS submitPaymentCashreceipt_)
    try {
      const invFresh = (await a.get(`invoices/${inv.id}/`)).data;
      const clientId = String(invFresh.client || contactId);
      const currency = invFresh.currency_code || invFresh.currency || 'EUR';
      // Calculate payment: net + VAT - withholding (ΤΠΥ only, > 301€, not IMENTOR_IKE)
      const whAmt = (kind !== 'APY' && org_key !== 'IMENTOR_IKE' && net > 301) ? net * 0.20 : 0;
      const payAmount = (net * 1.24 - whAmt).toFixed(2);
      await elorusPostCashreceipt(org_key, {
        transaction_type: 'ip',
        contact: clientId,
        date: iDate,
        amount: payAmount,
        currency_code: currency,
        invoice_payments: [{ invoice: String(inv.id), amount: payAmount }],
      });
    } catch (payErr) { console.warn('one-shot payment:', payErr.message); }

    await income.update({ invoice_number: invoiceNumber, elorus_invoice_id: String(inv.id) });
    res.json({ success: true, invoice_number: invoiceNumber, invoice: inv });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

router.post('/record-payment', async (req, res) => {
  try {
    const { income_id, org_key = 'DEFAULT', amount, date } = req.body;
    const income = await Income.findByPk(income_id);
    if (!income?.elorus_invoice_id) return res.status(400).json({ error: 'Δεν υπάρχει τιμολόγιο Elorus' });
    const a = api(org_key);
    const invData = (await a.get(`invoices/${income.elorus_invoice_id}/`)).data;
    const contactId = String(invData.client || invData.contact || '');
    const currency = invData.currency_code || invData.currency || 'EUR';
    const payAmount = parseFloat(amount).toFixed(2);
    const dateStr = date || new Date().toISOString().split('T')[0];
    const receipt = await elorusPostCashreceipt(org_key, {
      transaction_type: 'ip',
      contact: contactId,
      date: dateStr,
      amount: payAmount,
      currency_code: currency,
      invoice_payments: [{ invoice: String(income.elorus_invoice_id), amount: payAmount }],
    });
    res.json({ success: true, receipt });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

router.get('/payment-methods', async (req, res) => {
  try {
    const r = await api(req.query.org_key || 'DEFAULT').get('paymentmethods/?active=true');
    res.json(r.data.results || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
