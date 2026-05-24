const router = require('express').Router();
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const Income = require('../models/Income');
const Expense = require('../models/Expense');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Trim all keys in a CSV row — handles Google Sheets' leading-space column names
function normalizeRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[k.trim()] = typeof v === 'string' ? v.trim() : v;
  }
  return out;
}

const GREEK_MONTHS = {
  'ΙΑΝ': '01', 'ΦΕΒ': '02', 'ΜΑΡ': '03', 'ΑΠΡ': '04',
  'ΜΑΙ': '05', 'ΜΑΪ': '05', 'ΙΟΥΝ': '06', 'ΙΟΥΛ': '07',
  'ΑΥΓ': '08', 'ΣΕΠ': '09', 'ΟΚΤ': '10', 'ΝΟΕ': '11', 'ΔΕΚ': '12'
};

function parseDate(v) {
  if (!v || String(v).trim() === '') return null;
  const s = String(v).trim();

  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY (numeric)
  const m1 = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (m1) {
    let [, d, mo, y] = m1;
    if (y.length === 2) y = '20' + y;
    return `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }

  // DD-GreekMonth-YYYY  e.g. "31-Ιουλ-2017", "03-Αυγ-2017"
  const m2 = s.match(/^(\d{1,2})[- ]([^\d\s\-]+)[- ](\d{4})$/);
  if (m2) {
    const [, d, monthStr, y] = m2;
    const upper = monthStr.toUpperCase();
    const monthKey = Object.keys(GREEK_MONTHS).find(k => upper.startsWith(k));
    if (monthKey) return `${y}-${GREEK_MONTHS[monthKey]}-${d.padStart(2,'0')}`;
  }

  // YYYY-MM-DD passthrough
  if (s.match(/^\d{4}-\d{2}-\d{2}$/)) return s;
  return null;
}

function parseNum(v) {
  if (!v || String(v).trim() === '') return null;
  let s = String(v).trim();

  // Remove currency symbols and whitespace
  s = s.replace(/[€$\s]/g, '').trim();
  if (!s || /^-+$/.test(s) || s === '') return null;

  if (s.startsWith('(') && s.endsWith(')')) {
    s = '-' + s.slice(1, -1).trim();
  }

  // Detect Greek number format: dot = thousands separator, comma = decimal
  if (s.includes(',')) {
    // Greek decimal: "1.234,56" → "1234.56"
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    // No comma — dots may be thousands separators
    // Rule: if all segments separated by dots after the first are exactly 3 digits → thousands
    const parts = s.split('.');
    if (parts.length > 1) {
      const allThousands = parts.slice(1).every(p => /^\d{3}$/.test(p));
      if (allThousands) {
        s = parts.join(''); // "1.000" → "1000", "1.234.567" → "1234567"
      }
      // else: last dot is decimal separator (e.g. "1.5")
    }
  }

  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// DELETE all income
router.delete('/income', async (req, res) => {
  try {
    await Income.destroy({ where: {}, truncate: true });
    res.json({ deleted: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE all expenses
router.delete('/expenses', async (req, res) => {
  try {
    await Expense.destroy({ where: {}, truncate: true });
    res.json({ deleted: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Import ΕΣΟΔΑ CSV
router.post('/income', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Δεν βρέθηκε αρχείο' });

    const content = req.file.buffer.toString('utf-8');
    const rawRecords = parse(content, {
      columns: true, skip_empty_lines: true, trim: true, bom: true, relax_column_count: true
    });

    const toInsert = rawRecords
      .filter(raw => normalizeRow(raw)['ΕΠΩΝΥΜΙΑ ΠΕΛΑΤΗ ΧΟΝΔΡΙΚΗΣ'])
      .map(raw => {
        const r = normalizeRow(raw);
        return {
          customer_name:         r['ΕΠΩΝΥΜΙΑ ΠΕΛΑΤΗ ΧΟΝΔΡΙΚΗΣ'] || '',
          work_status:           r['ΚΑΤΑΣΤΑΣΗ ΕΡΓΑΣΙΑΣ'] || '',
          email:                 r['EMAIL'] || '',
          phone:                 r['ΚΙΝΗΤΟ'] || '',
          city:                  r['ΠΟΛΗ ή ΠΕΡΙΦΕΡΙΑ'] || '',
          postal_code:           r['ΤΚ'] || '',
          address:               r['ΔΙΕΥΘΥΝΣΗ'] || '',
          vat_number:            r['ΑΦΜ'] || '',
          business_activity:     r['ΑΝΤΙΚΕΙΜΕΝΟ'] || '',
          accountant:            r['ΛΟΓΙΣΤΗΣ'] || '',
          accountant_email:      r['EMAIL ΛΟΓΙΣΤΗ'] || '',
          amount_application:    parseNum(r['ΠΟΣΟ ΓΙΑ ΑΙΤΗΣΗ']),
          amount_implementation: parseNum(r['ΣΥΜΦΩΝΗΘΕΝ ΠΟΣΟ ΓΙΑ ΥΛΟΠΟΙΗΣΗ']),
          approval_date:         parseDate(r['Ημερομηνία Έγκρισης / Απόρριψης']),
          completion_deadline:   parseDate(r['Προθεσμία Ολοκλήρωσης']),
          investment_height:     parseNum(r['ΥΨΟΣ ΕΠΕΝΔΥΣΗΣ']),
          total_debts:           parseNum(r['ΣΥΝΟΛΟ ΟΦΕΙΛΩΝ']),
          source_referral:       r['ΠΡΟΕΛΕΥΣΗ - ΣΥΣΤΑΣΗ'] || '',
          sales_agent:           r['Υπεύθυνος Πώλησης'] || '',
          bonus:                 parseNum(r['BONUS']),         // no auto-calc
          folder_agent:          r['Υπεύθυνος Φακέλου'] || '',
          amount_collected:      parseNum(r['ΠΟΣΟ']),
          vat_amount:            parseNum(r['ΦΠΑ']),          // no auto-calc
          service_type:          r['ΕΙΔΟΣ ΥΠΗΡΕΣΙΑΣ'] || '',
          targeting_category:    r['ΚΑΤΗΓΟΡΙΑ ΣΤΟΧΟΘΕΣΙΑΣ'] || '',
          sale_date:             parseDate(r['ΗΜ.ΝΙΑ ΠΩΛΗΣΗΣ']),
          description:           r['ΑΙΤΙΟΛΟΓΙΑ - ΠΕΡΙΓΡΑΦΗ'] || '',
          invoice_number:        r['Νο'] || '',
          unsubscribe:           ['ναι','yes','true','1'].includes(
                                   String(r['UNSUBSCRIBE'] || '').toLowerCase().trim())
        };
      });

    const inserted = await Income.bulkCreate(toInsert, { validate: false });
    res.json({ imported: inserted.length, total: rawRecords.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Import ΕΞΟΔΑ / ΕΞΟΔΑ2 CSV
router.post('/expenses', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Δεν βρέθηκε αρχείο' });
    const { source_sheet = 'ΕΞΟΔΑ' } = req.body;

    const content = req.file.buffer.toString('utf-8');
    const rawRecords = parse(content, {
      columns: true, skip_empty_lines: true, trim: true, bom: true, relax_column_count: true
    });

    const toInsert = rawRecords
      .filter(raw => {
        const r = normalizeRow(raw);
        return r['ΗΜ.ΝΙΑ'] && parseDate(r['ΗΜ.ΝΙΑ']);
      })
      .map(raw => {
        const r = normalizeRow(raw);
        return {
          date:            parseDate(r['ΗΜ.ΝΙΑ']),
          amount:          parseNum(r['ΠΟΣΟ']) || 0,
          category:        r['ΓΕΝΙΚΗ ΚΑΤΗΓΟΡΙΑ ΕΞΟΔΩΝ-ΑΓΟΡΩΝ'] || '',
          supplier:        r['ΠΡΟΜΗΘΕΥΤΗΣ / ΥΠΑΛΛΗΛΟΣ / ΣΥΝΕΡΓΑΤΗΣ'] || '',
          related_service: r['ΤΟ ΕΞΟΔΟ ΑΦΟΡΑ ΠΟΙΑ ΥΠΗΡΕΣΙΑ'] || '',
          description:     r['ΑΙΤΙΟΛΟΓΙΑ - ΠΕΡΙΓΡΑΦΗ'] || '',
          source_sheet
        };
      });

    const inserted = await Expense.bulkCreate(toInsert, { validate: false });
    res.json({ imported: inserted.length, total: rawRecords.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const Customer = require('../models/Customer');
const ServiceAgreement = require('../models/ServiceAgreement');

router.post('/sync-customers', async (req, res) => {
  try {
    const { Op } = require('sequelize');
    const Income = require('../models/Income');
    const rows = await Income.findAll({ raw: true });

    const seen = new Map();
    for (const r of rows) {
      if (!r.customer_name) continue;
      const key = `${r.customer_name}|||${r.vat_number || ''}`;
      if (!seen.has(key)) seen.set(key, r);
    }

    let created = 0, updated = 0;
    for (const r of seen.values()) {
      const [cust, isNew] = await Customer.findOrCreate({
        where: { name: r.customer_name, vat_number: r.vat_number || null },
        defaults: {
          name: r.customer_name,
          vat_number: r.vat_number || null,
          email: r.email || null,
          phone: r.phone || null,
          city: r.city || null,
          postal_code: r.postal_code || null,
          address: r.address || null,
          business_activity: r.business_activity || null,
          accountant: r.accountant || null,
          accountant_email: r.accountant_email || null
        }
      });
      if (isNew) created++; else updated++;

      await Income.update(
        { customer_id: cust.id },
        { where: { customer_name: r.customer_name, vat_number: r.vat_number || { [Op.is]: null } } }
      );
    }

    res.json({ created, updated, total: seen.size });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/sync-agreements', async (req, res) => {
  try {
    const { Op } = require('sequelize');
    const Income = require('../models/Income');
    const rows = await Income.findAll({ raw: true });

    const seen = new Map();
    for (const r of rows) {
      if (!r.customer_name) continue;
      const key = `${r.customer_name}|||${r.service_type || ''}`;
      if (!seen.has(key)) {
        seen.set(key, {
          customer_name: r.customer_name,
          vat_number: r.vat_number || null,
          customer_id: r.customer_id || null,
          service_type: r.service_type || null,
          status: r.work_status || 'ΕΝΕΡΓΟ',
          amount_application: parseFloat(r.amount_application || 0),
          amount_implementation: parseFloat(r.amount_implementation || 0),
          approval_date: r.approval_date || null,
          completion_deadline: r.completion_deadline || null,
          investment_height: parseFloat(r.investment_height || 0) || null,
          total_debts: parseFloat(r.total_debts || 0) || null,
          sales_agent: r.sales_agent || null,
          folder_agent: r.folder_agent || null,
          source_referral: r.source_referral || null,
          targeting_category: r.targeting_category || null,
          description: r.description || null,
          amount_collected_total: 0,
          income_ids: []
        });
      }
      const sa = seen.get(key);
      sa.amount_collected_total += parseFloat(r.amount_collected || 0);
      sa.income_ids.push(r.id);
    }

    let created = 0, skipped = 0;
    for (const sa of seen.values()) {
      const existing = await ServiceAgreement.findOne({
        where: { customer_name: sa.customer_name, service_type: sa.service_type || { [Op.is]: null } }
      });
      if (existing) { skipped++; continue; }
      const { income_ids, ...saData } = sa;
      const newSa = await ServiceAgreement.create(saData);
      await Income.update(
        { service_agreement_id: newSa.id },
        { where: { id: { [Op.in]: income_ids } } }
      );
      created++;
    }

    res.json({ created, skipped, total: seen.size });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
