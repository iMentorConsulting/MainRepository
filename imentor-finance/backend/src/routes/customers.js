const router = require('express').Router();
const https = require('https');
const { Op, QueryTypes } = require('sequelize');
const Customer = require('../models/Customer');
const sequelize = require('../config/db');

function xmlEscape(s) {
  return (s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
}

async function aadeSearchAfm(vat, orgKey) {
  const isIke = orgKey === 'IMENTOR_IKE';
  const username = (isIke ? (process.env.AADE_USER_IMENTOR || '') : (process.env.AADE_USER || '')).trim();
  const password = (isIke ? (process.env.AADE_PASS_IMENTOR || '') : (process.env.AADE_PASS || '')).trim();
  const myAfm   = (isIke ? (process.env.MY_AFM_IMENTOR  || '') : (process.env.MY_AFM  || '')).trim();

  console.log(`AADE call: orgKey=${orgKey} user=${username||'EMPTY'} myAfm=${myAfm||'EMPTY'} vat=${vat}`);
  if (!myAfm) throw new Error(`MY_AFM${isIke ? '_IMENTOR' : ''} env var is not set in Railway`);
  if (!username) throw new Error(`AADE_USER${isIke ? '_IMENTOR' : ''} env var is not set in Railway`);

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

router.get('/', async (req, res) => {
  try {
    const { search, limit = 20 } = req.query;
    const where = {};
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { vat_number: { [Op.iLike]: `%${search}%` } }
      ];
    }
    const rows = await Customer.findAll({ where, limit: parseInt(limit), order: [['name', 'ASC']] });
    res.json({ data: rows, total: rows.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/search-afm', async (req, res) => {
  try {
    const { vat, org_key = 'DEFAULT' } = req.query;
    if (!vat) return res.status(400).json({ error: 'ΑΦΜ απαιτείται' });
    const result = await aadeSearchAfm(vat.trim(), org_key);
    res.json(result);
  } catch (e) {
    const detail = e.response?.data
      ? (typeof e.response.data === 'string' ? e.response.data.substring(0, 500) : JSON.stringify(e.response.data))
      : e.message;
    res.status(500).json({ error: detail, status: e.response?.status });
  }
});

router.post('/dedup', async (req, res) => {
  try {
    const dupes = await sequelize.query(`
      SELECT vat_number, MIN(id) AS keep_id, array_agg(id ORDER BY id) AS all_ids
      FROM customers
      WHERE vat_number IS NOT NULL AND TRIM(vat_number) != ''
      GROUP BY vat_number
      HAVING COUNT(*) > 1
    `, { type: QueryTypes.SELECT });

    let removed = 0;
    for (const { keep_id, all_ids } of dupes) {
      const drop_ids = all_ids.map(Number).filter(id => id !== Number(keep_id));
      if (!drop_ids.length) continue;
      await sequelize.query(`UPDATE income SET customer_id = :keep WHERE customer_id IN (:drop)`,
        { replacements: { keep: keep_id, drop: drop_ids } });
      await sequelize.query(`UPDATE service_agreements SET customer_id = :keep WHERE customer_id IN (:drop)`,
        { replacements: { keep: keep_id, drop: drop_ids } });
      await sequelize.query(`DELETE FROM customers WHERE id IN (:drop)`,
        { replacements: { drop: drop_ids } });
      removed += drop_ids.length;
    }
    res.json({ ok: true, groups: dupes.length, removed });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const vat = (req.body.vat_number || '').trim();
    if (vat) {
      const existing = await Customer.findOne({ where: { vat_number: vat } });
      if (existing) return res.status(409).json({ error: `Πελάτης με ΑΦΜ ${vat} υπάρχει ήδη (${existing.name})`, existing });
    }
    const c = await Customer.create(req.body);
    res.json(c);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const c = await Customer.findByPk(req.params.id);
    if (!c) return res.status(404).json({ error: 'Δεν βρέθηκε' });
    await c.update(req.body);
    res.json(c);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await Customer.destroy({ where: { id: req.params.id } });
    res.json({ deleted: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
