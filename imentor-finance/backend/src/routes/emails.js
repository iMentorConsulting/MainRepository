const router = require('express').Router();
const nodemailer = require('nodemailer');
const { Op } = require('sequelize');
const Income = require('../models/Income');
const CommissionLog = require('../models/CommissionLog');

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

      const year = new Date().getFullYear();
      const month = new Date().getMonth() + 1;
      await CommissionLog.create({
        accountant_name: accountant,
        accountant_email: email,
        income_ids: rows.map(r => r.id),
        total_amount: rows.reduce((s, r) => s + parseFloat(r.amount_collected || 0), 0),
        records_count: rows.length,
        year,
        month
      });

      results.push({ accountant, email, status: 'sent', count: rows.length });
    }

    res.json({ results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const COMPLETED_STATUSES = [
  'ΟΛΟΚΛΗΡΩΜΕΝΗ - ΠΑΡΑΙΤΗΣΗ', 'ΟΛΟΚΛΗΡΩΜΕΝΗ - ΕΠΙΤΥΧΩΣ', 'ΟΛΟΚΛΗΡΩΜΕΝΗ - ΑΠΟΡΡΙΨΗ',
  'ΟΛΟΚΛΗΡΩΜΕΝΗ - ΑΠΕΝΤΑΞΗ', 'ΟΛΟΚΛΗΡΩΣΗ - ΑΠΛΗ', 'ΟΛΟΚΛΗΡΩΜΕΝΗ - ΕΚΚΡΕΜΟΤΗΤΑ',
  'ΔΕΝ ΠΡΟΧΩΡΗΣΕ', 'ΟΛΟΚΛΗΡΩΘΗΚΕ', 'ΑΠΟΡΡΙΦΘΗΚΕ', 'ΑΚΥΡΩΜΕΝΟ', 'ΑΚΥΡΩΘΗΚΕ'
];

function deduplicateRows(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = `${r.customer_name}|||${r.service_type || ''}`;
    if (!map.has(key)) {
      map.set(key, { ...r });
    } else {
      const existing = map.get(key);
      if (r.sale_date && (!existing.sale_date || r.sale_date < existing.sale_date)) {
        existing.sale_date = r.sale_date;
      }
      if (r.approval_date && !existing.approval_date) existing.approval_date = r.approval_date;
      if (r.investment_height && !existing.investment_height) existing.investment_height = r.investment_height;
      if (r.total_debts && !existing.total_debts) existing.total_debts = r.total_debts;
    }
  }
  return [...map.values()];
}

function buildSectionHtml(rows, color, title) {
  if (rows.length === 0) return '';
  const isGreen = color === 'green';
  const borderColor = isGreen ? '#2e7d32' : '#1565c0';
  const headerBg = isGreen ? '#2e7d32' : '#1565c0';
  const bgLight = isGreen ? '#e8f5e9' : '#e3f2fd';
  const icon = isGreen ? '✅' : '☑';

  const rowsHtml = rows.map((r, i) => `
    <tr style="background:${i % 2 === 0 ? '#fff' : '#f9f9f9'}">
      <td style="padding:8px 10px;border:1px solid #e0e0e0;font-weight:600;font-size:13px">${r.customer_name || ''}</td>
      <td style="padding:8px 10px;border:1px solid #e0e0e0;font-size:13px">${r.work_status || ''}</td>
      <td style="padding:8px 10px;border:1px solid #e0e0e0;font-size:13px">${r.service_type || ''}</td>
      <td style="padding:8px 10px;border:1px solid #e0e0e0;font-size:13px;white-space:nowrap">${formatDate(r.sale_date)}</td>
      <td style="padding:8px 10px;border:1px solid #e0e0e0;font-size:13px;text-align:right">${r.investment_height ? formatMoney(r.investment_height) : ''}</td>
      <td style="padding:8px 10px;border:1px solid #e0e0e0;font-size:13px;text-align:right">${r.total_debts ? formatMoney(r.total_debts) : ''}</td>
      <td style="padding:8px 10px;border:1px solid #e0e0e0;font-size:13px;white-space:nowrap">${formatDate(r.approval_date)}</td>
    </tr>`).join('');

  return `
    <div style="margin:24px 0;border:2px solid ${borderColor};border-radius:8px;overflow:hidden">
      <div style="background:${bgLight};padding:10px 16px;border-bottom:2px solid ${borderColor};display:flex;align-items:center;gap:8px">
        <span style="font-size:18px">${icon}</span>
        <span style="font-size:15px;font-weight:700;color:${borderColor}">${title}</span>
        <span style="margin-left:auto;font-size:12px;color:${borderColor};background:#fff;padding:2px 8px;border-radius:999px;border:1px solid ${borderColor}">${rows.length} εγγραφές</span>
      </div>
      <div style="overflow-x:auto">
        <table style="border-collapse:collapse;width:100%;font-size:13px;min-width:700px">
          <thead>
            <tr style="background:${headerBg};color:#fff">
              <th style="padding:9px 10px;text-align:left;border:1px solid rgba(255,255,255,0.2)">Επωνυμία Πελάτη</th>
              <th style="padding:9px 10px;text-align:left;border:1px solid rgba(255,255,255,0.2)">Κατάσταση Εργασίας</th>
              <th style="padding:9px 10px;text-align:left;border:1px solid rgba(255,255,255,0.2)">Είδος Υπηρεσίας</th>
              <th style="padding:9px 10px;text-align:left;border:1px solid rgba(255,255,255,0.2)">Ημ/νία Συνεργασίας</th>
              <th style="padding:9px 10px;text-align:right;border:1px solid rgba(255,255,255,0.2)">Ύψος Επένδυσης</th>
              <th style="padding:9px 10px;text-align:right;border:1px solid rgba(255,255,255,0.2)">Σύνολο Οφειλών</th>
              <th style="padding:9px 10px;text-align:left;border:1px solid rgba(255,255,255,0.2)">Ημερομηνία Απόφασης</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </div>`;
}

function buildEmailHtml(accountant, rows) {
  const deduped = deduplicateRows(rows);
  const inProgress = deduped.filter(r => !COMPLETED_STATUSES.includes((r.work_status || '').toUpperCase().trim()));
  const completed = deduped.filter(r => COMPLETED_STATUSES.includes((r.work_status || '').toUpperCase().trim()));

  const programs = `
    <div style="margin-top:28px;padding:14px 18px;background:#f0f4ff;border-left:4px solid #3f51b5;border-radius:4px;font-size:13px;color:#333">
      <strong>Χρηματοδοτικά Εργαλεία i-Mentor:</strong><br>
      Επιδότηση Ανακαίνισης · Μικροδάνεια · Τουρισμός · Μεταποίηση · Αγροτικά · Εξοικονόμηση Ενέργειας
      <br><a href="https://i-mentor.gr" style="color:#3f51b5">www.i-mentor.gr</a>
    </div>`;

  return `<!DOCTYPE html>
<html lang="el">
<head><meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 14px; color: #333; max-width: 900px; margin: 0 auto; padding: 20px; }
</style>
</head>
<body>
  <p>Καλησπέρα <strong>${accountant}</strong>,</p>
  <p>Σας αποστέλλουμε ενημέρωση για την πορεία των πελατών σας:</p>
  ${buildSectionHtml(inProgress, 'green', 'Πελάτες σε εξέλιξη')}
  ${buildSectionHtml(completed, 'blue', 'Ολοκληρωμένοι Πελάτες')}
  ${programs}
  <br>
  <p>Με εκτίμηση,<br><strong>i-Mentor Team</strong><br>info@i-mentor.gr | www.i-mentor.gr</p>
</body>
</html>`;
}

router.get('/logs', async (req, res) => {
  try {
    const { year, month, accountant_email } = req.query;
    const where = {};
    if (year) where.year = parseInt(year);
    if (month) where.month = parseInt(month);
    if (accountant_email) where.accountant_email = accountant_email;
    const logs = await CommissionLog.findAll({ where, order: [['createdAt', 'DESC']], limit: 200 });
    res.json(logs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/accountants', async (req, res) => {
  try {
    const { Op } = require('sequelize');
    const Income = require('../models/Income');
    const { year } = req.query;
    const where = { accountant: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] } };
    if (year) where.sale_date = { [Op.between]: [`${year}-01-01`, `${year}-12-31`] };
    const rows = await Income.findAll({
      attributes: ['accountant', 'accountant_email'],
      where,
      group: ['accountant', 'accountant_email'],
      order: [['accountant', 'ASC']],
      raw: true
    });
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
