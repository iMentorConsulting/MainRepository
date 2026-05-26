require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sequelize = require('./config/db');

require('./models/Income');
require('./models/Expense');
require('./models/ListItem');
require('./models/CommissionLog');
require('./models/Customer');
require('./models/ServiceAgreement');
require('./models/RecurringExpense');

const authMiddleware = require('./middleware/auth');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/api/auth', require('./routes/auth'));

// Public debug: read full doc type details + real invoice mydata_document_type from Elorus
app.get('/api/debug/invoice-fields', async (req, res) => {
  try {
    const axios = require('axios');
    const orgKey = req.query.org_key || 'DEFAULT';
    const ORGS = { DEFAULT: process.env.ELORUS_ORG_DEFAULT, IMENTOR_IKE: process.env.ELORUS_ORG_IMENTOR_IKE };
    const BASE = 'https://api.elorus.com/v1.1/';
    const headers = {
      Authorization: `Token ${process.env.ELORUS_TOKEN}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Elorus-Organization': ORGS[orgKey] || ORGS.DEFAULT,
    };
    const dtR = await axios.get(`${BASE}documenttypes/?active=true&page_size=100`, { headers });
    const allDt = dtR.data.results || [];
    const result = { docTypeDetails: {}, invoices: {} };
    for (const dt of allDt) {
      const detail = (await axios.get(`${BASE}documenttypes/${dt.id}/`, { headers })).data;
      result.docTypeDetails[dt.title] = detail;
      try {
        const invR = await axios.get(`${BASE}invoices/?document_type=${dt.id}&page_size=2`, { headers });
        const invs = invR.data.results || [];
        if (invs.length) {
          result.invoices[dt.title] = invs.map(i => ({
            number: i.number, draft: i.draft,
            mydata_document_type: i.mydata_document_type,
            items: (i.items || []).map(it => ({
              mydata_classification_category: it.mydata_classification_category,
              mydata_classification_type: it.mydata_classification_type,
            })),
          }));
        }
      } catch (ie) { /* skip */ }
    }
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.response?.data || e.message }); }
});

// Public debug endpoint — no auth (temporary, for Elorus tax rate discovery)
app.get('/api/debug/elorus', async (req, res) => {
  try {
    const axios = require('axios');
    const orgKey = req.query.org_key || 'DEFAULT';
    const ORGS = { DEFAULT: process.env.ELORUS_ORG_DEFAULT, IMENTOR_IKE: process.env.ELORUS_ORG_IMENTOR_IKE };
    const headers = {
      Authorization: `Token ${process.env.ELORUS_TOKEN}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Elorus-Organization': ORGS[orgKey] || ORGS.DEFAULT,
    };
    const BASE = 'https://api.elorus.com/v1.1/';
    const out = {};
    for (const ep of ['', 'itemtaxes/', 'itemtaxes/?active=true', 'taxes/', 'taxratecategories/', 'taxrates/', 'invoices/?page_size=1']) {
      try { out[ep || 'ROOT'] = (await axios.get(`${BASE}${ep}`, { headers })).data; }
      catch (e) { out[ep || 'ROOT'] = { status: e.response?.status, error: e.message }; }
    }
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.use('/api/invoices/tax-rates', require('./routes/invoices')); // kept but unused now
app.use('/api/income',     authMiddleware, require('./routes/income'));
app.use('/api/expenses',   authMiddleware, require('./routes/expenses'));
app.use('/api/lists',      authMiddleware, require('./routes/listItems'));
app.use('/api/invoices',   authMiddleware, require('./routes/invoices'));
app.use('/api/emails',     authMiddleware, require('./routes/emails'));
app.use('/api/reports',    authMiddleware, require('./routes/reports'));
app.use('/api/import',     authMiddleware, require('./routes/importData'));
app.use('/api/customers',          authMiddleware, require('./routes/customers'));
app.use('/api/service-agreements', authMiddleware, require('./routes/serviceAgreements'));
app.use('/api/recurring-expenses', authMiddleware, require('./routes/recurringExpenses'));
// Case management sync — own API-key auth, no user auth middleware
app.use('/api/cm-sync', require('./routes/cmSync'));

app.get('/health', (_, res) => res.json({ ok: true }));

// Serve React frontend in production
if (process.env.NODE_ENV === 'production') {
  const path = require('path');
  app.use(express.static(path.join(__dirname, '../public')));
  app.get('*', (_, res) => res.sendFile(path.join(__dirname, '../public/index.html')));
}

const PORT = process.env.PORT || 3001;

sequelize.sync({ alter: true }).then(async () => {
  console.log('Database connected & synced');
  app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
}).catch(err => {
  console.error('DB sync error:', err.message);
  process.exit(1);
});
