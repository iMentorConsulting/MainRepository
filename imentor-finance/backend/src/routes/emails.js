const router = require('express').Router();
const nodemailer = require('nodemailer');
const { Op } = require('sequelize');
const Income = require('../models/Income');

function createTransport() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD
    }
  });
}

function formatDate(d) {
  if (!d) return '';
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return String(d); }
}

function formatMoney(v) {
  if (!v) return '';
  return Number(v).toLocaleString('el-GR', { style: 'currency', currency: 'EUR' });
}

// Preview email content for given income IDs grouped by accountant
router.post('/preview', async (req, res) => {
  try {
    const { income_ids } = req.body;
    const records = await Income.findAll({ where: { id: { [Op.in]: income_ids } } });

    const grouped = {};
    for (const r of records) {
      const key = r.accountant || 'ΧΩΡΙΣ ΛΟΓΙΣΤΗ';
      if (!grouped[key]) grouped[key] = { accountant: key, email: r.accountant_email || '', rows: [] };
      grouped[key].rows.push(r);
    }

    const emails = Object.values(grouped).map(({ accountant, email, rows }) => ({
      accountant, email,
      subject: `Ενημέρωση Νέων Εισπράξεων – i-Mentor`,
      html: buildEmailHtml(accountant, rows)
    }));

    res.json(emails);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Send emails for given income IDs
router.post('/send', async (req, res) => {
  try {
    const { income_ids } = req.body;
    const records = await Income.findAll({ where: { id: { [Op.in]: income_ids } } });

    const grouped = {};
    for (const r of records) {
      const key = r.accountant || 'ΧΩΡΙΣ ΛΟΓΙΣΤΗ';
      if (!grouped[key]) grouped[key] = { accountant: key, email: r.accountant_email || '', rows: [] };
      grouped[key].rows.push(r);
    }

    const transport = createTransport();
    const results = [];

    for (const { accountant, email, rows } of Object.values(grouped)) {
      if (!email) { results.push({ accountant, status: 'skipped', reason: 'Δεν υπάρχει email λογιστή' }); continue; }

      await transport.sendMail({
        from: `i-Mentor <${process.env.GMAIL_USER}>`,
        to: email,
        bcc: process.env.GMAIL_USER,
        subject: `Ενημέρωση Νέων Εισπράξεων – i-Mentor`,
        html: buildEmailHtml(accountant, rows)
      });

      await Income.update(
        { accountant_notified: true, accountant_notified_at: new Date() },
        { where: { id: { [Op.in]: rows.map(r => r.id) } } }
      );

      results.push({ accountant, email, status: 'sent', count: rows.length });
    }

    res.json({ results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function buildEmailHtml(accountant, rows) {
  const rows_html = rows.map(r => `
    <tr>
      <td style="padding:8px;border:1px solid #ddd;">${r.customer_name || ''}</td>
      <td style="padding:8px;border:1px solid #ddd;">${r.service_type || ''}</td>
      <td style="padding:8px;border:1px solid #ddd;">${formatMoney(r.amount_collected)}</td>
      <td style="padding:8px;border:1px solid #ddd;">${formatMoney(r.vat_amount)}</td>
      <td style="padding:8px;border:1px solid #ddd;">${formatDate(r.sale_date)}</td>
      <td style="padding:8px;border:1px solid #ddd;">${r.invoice_number || ''}</td>
      <td style="padding:8px;border:1px solid #ddd;">${r.work_status || ''}</td>
      <td style="padding:8px;border:1px solid #ddd;">${r.description || ''}</td>
    </tr>`).join('');

  return `
  <!DOCTYPE html>
  <html lang="el">
  <head><meta charset="UTF-8"><style>
    body { font-family: Arial, sans-serif; font-size: 14px; color: #333; }
    table { border-collapse: collapse; width: 100%; }
    th { background: #1a56db; color: white; padding: 10px; text-align: left; }
    tr:nth-child(even) td { background: #f8f9fa; }
  </style></head>
  <body>
    <p>Καλησπέρα ${accountant},</p>
    <p>Σας αποστέλλουμε τις παρακάτω νέες εισπράξεις για ενημέρωση:</p>
    <table>
      <thead>
        <tr>
          <th>Πελάτης</th><th>Υπηρεσία</th><th>Ποσό</th><th>ΦΠΑ</th>
          <th>Ημ/νία</th><th>Τιμολόγιο</th><th>Κατάσταση</th><th>Αιτιολογία</th>
        </tr>
      </thead>
      <tbody>${rows_html}</tbody>
    </table>
    <br>
    <p>Με εκτίμηση,<br><strong>i-Mentor Team</strong><br>info@i-mentor.gr</p>
  </body>
  </html>`;
}

module.exports = router;
