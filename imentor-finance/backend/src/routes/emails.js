const router = require('express').Router();
const { Op } = require('sequelize');
const Income = require('../models/Income');
const CommissionLog = require('../models/CommissionLog');
const { sendViaGmailApi } = require('../utils/gmail');

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

async function lookupAccountantEmail(accountantName) {
  try {
    const found = await Income.findOne({
      where: { accountant: accountantName, accountant_email: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] } },
      attributes: ['accountant_email'],
      raw: true
    });
    return found?.accountant_email || '';
  } catch { return ''; }
}

function groupRecords(records) {
  const grouped = {};
  for (const r of records) {
    const row = r.toJSON ? r.toJSON() : r;
    const key = row.accountant || 'ΧΩΡΙΣ ΛΟΓΙΣΤΗ';
    if (!grouped[key]) grouped[key] = { accountant: key, email: '', rows: [] };
    if (!grouped[key].email && row.accountant_email) grouped[key].email = row.accountant_email;
    grouped[key].rows.push(row);
  }
  return grouped;
}

// Preview email content for given income IDs grouped by accountant
router.post('/preview', async (req, res) => {
  try {
    const { income_ids } = req.body;
    const records = await Income.findAll({ where: { id: { [Op.in]: income_ids } } });
    const grouped = groupRecords(records);

    // Fill missing emails via DB lookup
    for (const group of Object.values(grouped)) {
      if (!group.email && group.accountant !== 'ΧΩΡΙΣ ΛΟΓΙΣΤΗ') {
        group.email = await lookupAccountantEmail(group.accountant);
      }
    }

    const emails = Object.values(grouped).map(({ accountant, email, rows }) => ({
      accountant, email,
      subject: `📬 Κατάσταση Πελατών Λογιστή: ${accountant} – i-Mentor (${new Date().toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })})`,
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

    const grouped = groupRecords(records);

    // Fill missing emails via DB lookup
    for (const group of Object.values(grouped)) {
      if (!group.email && group.accountant !== 'ΧΩΡΙΣ ΛΟΓΙΣΤΗ') {
        group.email = await lookupAccountantEmail(group.accountant);
      }
    }

    const fromAddr = process.env.SMTP_USER || process.env.GMAIL_USER;
    const results = [];

    for (const { accountant, email, rows } of Object.values(grouped)) {
      if (!email) { results.push({ accountant, status: 'skipped', reason: 'Δεν υπάρχει email λογιστή' }); continue; }

      try {
        await sendViaGmailApi(fromAddr, email, fromAddr, `📬 Κατάσταση Πελατών Λογιστή: ${accountant} – i-Mentor (${new Date().toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })})`, buildEmailHtml(accountant, rows));

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
      } catch (mailErr) {
        results.push({ accountant, email, status: 'error', reason: mailErr.message });
      }
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

function buildEmailHtml(accountant, rows, customFinancingHtml) {
  const today = new Date().toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const deduped = deduplicateRows(rows);
  const inProgress = deduped.filter(r => !COMPLETED_STATUSES.includes((r.work_status || '').trim()));
  const completed = deduped.filter(r => COMPLETED_STATUSES.includes((r.work_status || '').trim()));

  const financingHtml = customFinancingHtml || `
    <div style="margin-top:32px;padding:0">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
        <div style="width:28px;height:28px;background:#d32f2f;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <span style="color:#fff;font-size:14px;font-weight:bold">★</span>
        </div>
        <h2 style="margin:0;font-size:17px;font-weight:700;color:#1a237e">Νέα Χρηματοδοτικά Προγράμματα από την i-Mentor</h2>
      </div>
      <hr style="border:none;border-top:2px dashed #1a237e;margin:0 0 20px 0">

      <div style="margin-bottom:16px">
        <p style="margin:0 0 6px 0;font-size:14px;font-weight:700;color:#333">• Ανακαίνιση Παλαιών Κατοικιών 36.000€</p>
        <ul style="margin:4px 0 4px 20px;padding:0;font-size:13px;color:#555">
          <li>Επιχορήγηση 70%-90% για ενεργειακή και λειτουργική αναβάθμιση κατοικιών</li>
          <li>Ιδανικό για ιδιοκτήτες που θέλουν αναβάθμιση ακινήτου</li>
          <li>Προτεραιότητα στα κλειστά ακίνητα</li>
        </ul>
        <a href="https://i-mentor.gr/anakainisi-palaiwn-spitiwn/" style="color:#1565c0;font-size:13px;text-decoration:none">→ Δείτε περισσότερα</a>
      </div>

      <div style="margin-bottom:16px">
        <p style="margin:0 0 6px 0;font-size:14px;font-weight:700;color:#333">• Ταμείο Μικροπιστώσεων 25.000€</p>
        <ul style="margin:4px 0 4px 20px;padding:0;font-size:13px;color:#555">
          <li>Επιχειρηματικά Δάνεια</li>
          <li>Διαδικασία online μέσω ΤΜΕΔΕ - AFI - MICROSMART</li>
          <li>ΤΕΠΙΧ ΙΙΙ - Ελληνική Αναπτυξιακή Τράπεζα</li>
        </ul>
        <a href="https://i-mentor.gr/tamio-mikropistoseon" style="color:#1565c0;font-size:13px;text-decoration:none">→ Δείτε περισσότερα</a>
      </div>

      <div style="margin-bottom:16px">
        <p style="margin:0 0 6px 0;font-size:14px;font-weight:700;color:#333">• Παράγομε Ελλάδα | 50% έως 200.000€ Επιχορήγηση</p>
        <ul style="margin:4px 0 4px 20px;padding:0;font-size:13px;color:#555">
          <li>Αφορά μόνο Μεταποιητικές Επιχειρήσεις</li>
          <li>Χρηματοδότηση για εξοπλισμό &amp; ανάπτυξη</li>
          <li>Προθεσμία αιτήσεων έως 2 Ιουνίου 2026</li>
        </ul>
        <a href="https://i-mentor.gr/paragoume-ellada/" style="color:#1565c0;font-size:13px;text-decoration:none">→ Δείτε περισσότερα</a>
      </div>

      <div style="margin-bottom:16px">
        <p style="margin:0 0 6px 0;font-size:14px;font-weight:700;color:#333">• Επιχειρώ Πράσινα στην Κρήτη | 50% έως 200.000€ Επιχορήγηση</p>
        <ul style="margin:4px 0 4px 20px;padding:0;font-size:13px;color:#555">
          <li>Αφορά Ξενοδοχεία &amp; Μεταποίηση στην Κρήτη</li>
          <li>Προθεσμία αιτήσεων έως 28 Μαΐου 2026</li>
        </ul>
      </div>

      <div style="margin-bottom:16px">
        <p style="margin:0 0 6px 0;font-size:14px;font-weight:700;color:#333">• Έναρξη Επιχείρησης από Πτυχιούχους</p>
        <ul style="margin:4px 0 4px 20px;padding:0;font-size:13px;color:#555">
          <li>Επιχορήγηση για δημιουργία νέας επιχείρησης</li>
          <li>Αφορά Πτυχιούχους για έναρξη επιχείρησης στον τομέα τους</li>
        </ul>
        <a href="https://i-mentor.gr/program/ksekinw-epixeirhmatika/" style="color:#1565c0;font-size:13px;text-decoration:none">→ Δείτε περισσότερα</a>
      </div>

      <div style="margin-bottom:16px">
        <p style="margin:0 0 6px 0;font-size:14px;font-weight:700;color:#333">• Υπηρεσία Ρύθμισης Οφειλών μέσω Εξωδικαστικού Μηχανισμού</p>
        <ul style="margin:4px 0 4px 20px;padding:0;font-size:13px;color:#555">
          <li>Ρύθμιση οφειλών σε Εφορία, ΚΕΑΟ, Τράπεζες &amp; Funds</li>
          <li>Έως 240 δόσεις για Δημόσιο και 420 για τράπεζες</li>
          <li>Αξιολόγηση επιλεξιμότητας &amp; πλήρης υποστήριξη από i-Mentor</li>
        </ul>
        <a href="https://i-mentor.gr/exodikastikos/" style="color:#1565c0;font-size:13px;text-decoration:none">→ Δείτε περισσότερα</a>
      </div>

      <div style="margin-bottom:16px">
        <p style="margin:0 0 6px 0;font-size:14px;font-weight:700;color:#333">• Πτώχευση ιδιωτών Μικρού Αντικειμένου</p>
        <ul style="margin:4px 0 4px 20px;padding:0;font-size:13px;color:#555">
          <li>Δικαστική διαδικασία με πλήρη μηδενισμό οφειλών</li>
          <li>Η i-Mentor Consulting αναλαμβάνει συνολικά τη διαδικασία</li>
        </ul>
        <a href="https://i-mentor.gr/neos-ptocheftikos-nomos/" style="color:#1565c0;font-size:13px;text-decoration:none">→ Δείτε περισσότερα</a>
      </div>

      <div style="text-align:right;margin-top:24px">
        <span style="font-size:14px;color:#333">📞 <strong>2810 363007</strong> &nbsp;|&nbsp; ✉️ <a href="mailto:info@i-mentor.gr" style="color:#1565c0;text-decoration:none">info@i-mentor.gr</a></span>
      </div>
    </div>`;

  return `<!DOCTYPE html>
<html lang="el">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:20px;background:#f5f6fa;font-family:Arial,Helvetica,sans-serif;color:#333">
  <div style="max-width:900px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.10)">

    <!-- Header with logo -->
    <div style="background:#1a237e;padding:16px 30px;display:flex;align-items:center;justify-content:space-between">
      <div style="color:#fff;font-size:18px;font-weight:700;letter-spacing:0.5px">i-Mentor Consulting</div>
      <div style="color:#90caf9;font-size:13px">${today}</div>
    </div>

    <!-- Body -->
    <div style="padding:30px">
      <p style="font-size:15px;margin:0 0 12px">Αγαπητή/ε <strong>${accountant}</strong>,</p>
      <p style="font-size:14px;color:#555;margin:0 0 8px">Σας αποστέλλουμε την επικαιροποιημένη εικόνα των κοινών πελατών μας με βάση τα δεδομένα μας (ημερομηνία αναφοράς: <strong>${today}</strong>).</p>
      <p style="font-size:14px;color:#555;margin:0 0 8px">Η παρούσα αναφορά έχει ως στόχο να διευκολύνει τη συνεργασία μας και να σας κρατά ενήμερους για την κατάσταση των πελατών σας.</p>
      <p style="font-size:14px;color:#555;margin:0 0 4px">Ο πίνακας χωρίζεται σε δύο ενότητες:</p>
      <ul style="font-size:14px;color:#555;margin:4px 0 16px 20px;padding:0">
        <li><strong>Πελάτες σε εξέλιξη</strong>: υποβολές αιτήσεων, εγκρίσεις, προετοιμασία φακέλου κ.λπ.</li>
        <li><strong>Ολοκληρωμένοι πελάτες</strong>: πελάτες με ολοκληρωμένες ή κλεισμένες υποθέσεις</li>
      </ul>

      ${buildSectionHtml(inProgress, 'green', 'Πελάτες σε εξέλιξη')}
      ${buildSectionHtml(completed, 'blue', 'Ολοκληρωμένοι Πελάτες')}
      ${financingHtml}
    </div>

    <!-- Footer -->
    <div style="background:#f5f6fa;padding:16px 30px;border-top:1px solid #e0e0e0">
      <p style="font-size:12px;color:#888;margin:0">Αν δεν επιθυμείτε να λαμβάνετε παρόμοιες ενημερώσεις, απαντήστε με θέμα <strong>"ΑΠΕΓΓΡΑΦΗ"</strong> στο <a href="mailto:info@i-mentor.gr" style="color:#1565c0">info@i-mentor.gr</a></p>
    </div>
  </div>
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
    const sequelize = require('../config/db');
    const { QueryTypes } = require('sequelize');
    const { year } = req.query;
    const yearClause = year
      ? `AND sale_date BETWEEN '${year}-01-01' AND '${year}-12-31'`
      : '';
    const rows = await sequelize.query(`
      SELECT
        accountant,
        MAX(accountant_email) AS accountant_email,
        COUNT(*) AS count
      FROM income
      WHERE accountant IS NOT NULL AND accountant != '' ${yearClause}
      GROUP BY accountant
      ORDER BY accountant ASC
    `, { type: QueryTypes.SELECT });
    res.json(rows.map(r => ({ ...r, count: parseInt(r.count || 0) })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
