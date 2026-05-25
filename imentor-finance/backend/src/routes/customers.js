const router = require('express').Router();
const { Op } = require('sequelize');
const Customer = require('../models/Customer');
const axios = require('axios');

async function aadeSearchAfm(vat, orgKey) {
  const isIke = orgKey === 'IMENTOR_IKE';
  const username = isIke ? (process.env.AADE_USER_IMENTOR || '') : (process.env.AADE_USER || '');
  const password = isIke ? (process.env.AADE_PASS_IMENTOR || '') : (process.env.AADE_PASS || '');
  const myAfm   = isIke ? (process.env.MY_AFM_IMENTOR  || '') : (process.env.MY_AFM  || '');

  const soapBody = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:pub="http://rgwspublic2.rg.gov.gr/">
    <soapenv:Header/>
    <soapenv:Body>
      <pub:rgWsPublic2AfmMethod>
        <pub:INPUT_REC>
          <pub:afm_called_by>${myAfm}</pub:afm_called_by>
          <pub:afm_called_for>${vat}</pub:afm_called_for>
        </pub:INPUT_REC>
      </pub:rgWsPublic2AfmMethod>
    </soapenv:Body>
  </soapenv:Envelope>`;

  const credentials = Buffer.from(`${username}:${password}`).toString('base64');
  const r = await axios.post(
    'https://www1.gsis.gr/wsaade/RgWsPublic2/RgWsPublic2',
    soapBody,
    {
      headers: {
        'Content-Type': 'text/xml;charset=UTF-8',
        'SOAPAction': '""',
        'Authorization': `Basic ${credentials}`,
        'Accept': 'text/xml',
      },
      timeout: 10000
    }
  );

  const xml = r.data;
  const get = tag => {
    const m = xml.match(new RegExp(`<[^:>]*:?${tag}>([^<]*)<`));
    return m ? m[1].trim() : null;
  };
  const errorCode = get('error_code');
  if (errorCode && errorCode !== 'RET_CODE_OK' && errorCode !== '') {
    return { error: get('error_descr') || `Error: ${errorCode}` };
  }
  return {
    name: get('onomasia'),
    address: get('postal_address'),
    city: get('postal_address_city'),
    postal_code: get('postal_zip_code'),
    vat: get('afm'),
    activity: get('activity_descr'),
    legal_status: get('legal_status_descr')
  };
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
