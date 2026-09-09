const router = require('express').Router();
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/db');

// Shared-secret auth — case management sends X-CM-Sync-Secret header
router.use((req, res, next) => {
  const secret = process.env.CM_SYNC_SECRET;
  if (!secret) return res.status(500).json({ error: 'CM_SYNC_SECRET not configured on finance app' });
  const provided = req.headers['x-cm-sync-secret'];
  if (!provided || provided !== secret) return res.status(401).json({ error: 'Unauthorized' });
  next();
});

// GET /api/cm-sync
// Returns all service agreements enriched with aggregated income data.
// Fields map directly to what the case management system needs.
router.get('/', async (req, res) => {
  try {
    const rows = await sequelize.query(`
      SELECT
        sa.id                                                          AS finance_id,
        sa.customer_name,
        sa.service_type,
        sa.approval_date,
        sa.completion_deadline,
        sa.folder_agent,
        sa.sales_agent,
        COALESCE(SUM(i.amount_collected), 0)                          AS total_paid,
        MAX(i.vat_number)        FILTER (WHERE i.vat_number        IS NOT NULL AND i.vat_number        <> '') AS vat_number,
        MAX(i.amount_application)                                     AS amount_application,
        MAX(i.amount_implementation)                                  AS amount_implementation,
        MAX(i.investment_height)                                      AS investment_height,
        MIN(i.sale_date)                                              AS sale_date,
        MAX(i.email)             FILTER (WHERE i.email             IS NOT NULL AND i.email             <> '') AS email,
        MAX(i.phone)             FILTER (WHERE i.phone             IS NOT NULL AND i.phone             <> '') AS phone,
        MAX(i.accountant)        FILTER (WHERE i.accountant        IS NOT NULL AND i.accountant        <> '') AS accountant,
        (SELECT i2.work_status FROM income i2
         WHERE i2.service_agreement_id = sa.id
           AND i2.work_status IS NOT NULL
           AND i2.work_status <> ''
         ORDER BY i2.id DESC
         LIMIT 1)                                                      AS work_status
      FROM service_agreements sa
      LEFT JOIN income i ON i.service_agreement_id = sa.id
      GROUP BY sa.id
      ORDER BY sa.id
    `, { type: QueryTypes.SELECT });

    res.json({ count: rows.length, data: rows });
  } catch (e) {
    console.error('[cm-sync] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
