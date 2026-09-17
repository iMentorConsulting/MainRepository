const router = require('express').Router();
const sequelize = require('../config/db');
const { QueryTypes } = require('sequelize');

// x-api-key auth
router.use((req, res, next) => {
  const key = process.env.LEAD_INTAKE_API_KEY;
  if (!key) return res.status(500).json({ error: 'LEAD_INTAKE_API_KEY not configured on finance app' });
  if (req.headers['x-api-key'] !== key) return res.status(401).json({ error: 'Unauthorized' });
  next();
});

// One-time column migrations — idempotent
let _migrated = false;
async function ensureColumns() {
  if (_migrated) return;
  const t = 'incomes'; // Sequelize default: pluralised model name
  await sequelize.query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS external_id VARCHAR(200)`);
  await sequelize.query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS invoice_type VARCHAR(50)`);
  await sequelize.query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS organization VARCHAR(100)`);
  await sequelize.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_income_external_id ON ${t}(external_id) WHERE external_id IS NOT NULL`);
  _migrated = true;
}

// POST /api/lead-intake
// Idempotent: if external_id already exists, returns the existing record.
router.post('/', async (req, res) => {
  try {
    await ensureColumns();

    const {
      external_id, customer_name, vat_number, phone, email,
      sales_agent, sale_date, source_referral,
      invoice_type, amount_collected, vat_amount,
      organization, service_type, targeting_category,
      work_status, description,
      address, city, amount_application, amount_implementation,
    } = req.body;

    if (!external_id) return res.status(400).json({ error: 'external_id is required' });

    // Check idempotency
    const existing = await sequelize.query(
      'SELECT id FROM incomes WHERE external_id = :eid LIMIT 1',
      { replacements: { eid: external_id }, type: QueryTypes.SELECT }
    );
    if (existing.length > 0) {
      return res.json({ ok: true, id: existing[0].id, created: false });
    }

    const [[inserted]] = await sequelize.query(
      `INSERT INTO incomes (
        external_id, customer_name, vat_number, phone, email,
        sales_agent, sale_date, source_referral,
        invoice_type, amount_collected, vat_amount,
        organization, service_type, targeting_category,
        work_status, description, address, city,
        amount_application, amount_implementation,
        "createdAt", "updatedAt"
      ) VALUES (
        :external_id, :customer_name, :vat_number, :phone, :email,
        :sales_agent, :sale_date, :source_referral,
        :invoice_type, :amount_collected, :vat_amount,
        :organization, :service_type, :targeting_category,
        :work_status, :description, :address, :city,
        :amount_application, :amount_implementation,
        NOW(), NOW()
      ) RETURNING id`,
      {
        replacements: {
          external_id,
          customer_name: customer_name || '',
          vat_number: vat_number || '',
          phone: phone || '',
          email: email || '',
          sales_agent: sales_agent || '',
          sale_date: sale_date || null,
          source_referral: source_referral || '',
          invoice_type: invoice_type || '',
          amount_collected: amount_collected != null ? parseFloat(amount_collected) : null,
          vat_amount: vat_amount != null ? parseFloat(vat_amount) : null,
          organization: organization || '',
          service_type: service_type || '',
          targeting_category: targeting_category || '',
          work_status: work_status || '',
          description: description || '',
          address: address || '',
          city: city || '',
          amount_application: amount_application != null ? parseFloat(amount_application) : null,
          amount_implementation: amount_implementation != null ? parseFloat(amount_implementation) : null,
        },
        type: QueryTypes.INSERT,
      }
    );

    res.status(201).json({ ok: true, id: inserted.id, created: true });
  } catch (e) {
    console.error('[lead-intake] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
