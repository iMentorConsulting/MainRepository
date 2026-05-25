const router = require('express').Router();
const https = require('https');
const { Op } = require('sequelize');
const Customer = require('../models/Customer');

async function aadeSearchAfm(vat, orgKey) {
  const isIke = orgKey === 'IMENTOR_IKE';
  const username = isIke ? (process.env.AADE_USER_IMENTOR || '') : (process.env.AADE_USER || '');
  const password = isIke ? (process.env.AADE_PASS_IMENTOR || '') : (process.env.AADE_PASS || '');
  const myAfm   = isIke ? (process.env.MY_AFM_IMENTOR  || '') : (process.env.MY_AFM  || '');

  console.log(`AADE call: orgKey=${orgKey} user=${username||'EMPTY'} myAfm=${myAfm||'EMPTY'} vat=${vat}`);
  if (!myAfm) throw new Error(`MY_AFM${isIke ? '_IMENTOR' : ''} env var is not set in Railway`);
  if (!username) throw new Error(`AADE_USER${isIke ? '_IMENTOR' : ''} env var is not set in Railway`);

  const soapBody = `<?xml version="1.0" encoding="UTF-8"?><env:Envelope xmlns:env="http://www.w3.org/2003/05/soap-envelope" xmlns:pub="http://rgwspublic2.rg.gov.gr/"><env:Header/><env:Body><pub:rgWsPublic2AfmMethod><pub:INPUT_REC><pub:afm_called_by>${myAfm}</pub:afm_called_by><pub:afm_called_for>${vat}</pub:afm_called_for></pub:INPUT_REC></pub:rgWsPublic2AfmMethod></env:Body></env:Envelope>`;

  const bodyBuffer = Buffer.from(soapBody, 'utf8');
  const credentials = Buffer.from(`${username}:${password}`).toString('base64');

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'www1.gsis.gr',
      path: '/wsaade/RgWsPublic2/RgWsPublic2',
      method: 'POST',
      headers: {
        'Content-Type': 'application/soap+xml;charset=utf-8',
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

router.post('/', async (req, res) => {
  try {
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
