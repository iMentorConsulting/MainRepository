const router = require('express').Router();
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const Income = require('../models/Income');
const Expense = require('../models/Expense');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Normalize row: trim all keys so ' ΠΟΣΟ' and 'ΠΟΣΟ' both work
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

  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const m1 = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (m1) {
    let [, d, mo, y] = m1;
    if (y.length === 2) y = '20' + y;
    return `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }

  // DD-GreekMonth-YYYY  e.g. 31-Ιουλ-2017
  const m2 = s.match(/^(\d{1,2})[- ]([^\d\s\-]+)[- ](\d{4})$/);
  if (m2) {
    const [, d, monthStr, y] = m2;
    const upper = monthStr.toUpperCase();
    const monthKey = Object.keys(GREEK_MONTHS).find(k => upper.startsWith(k));
    if (monthKey) {
      return `${y}-${GREEK_MONTHS[monthKey]}-${d.padStart(2,'0')}`;
    }
  }

  // YYYY-MM-DD passthrough
  if (s.match(/^\d{4}-\d{2}-\d{2}$/)) return s;

  return null;
}

function parseNum(v) {
  if (!v || String(v).trim() === '') return null;
  let s = String(v).trim();
  // Remove currency symbol, extra spaces, and dash-only values
  s = s.replace(/[€$\s]/g, '').trim();
  if (!s || s === '-' || s.replace(/-/g,'') === '') return null;
  // Handle Greek number format: 1.234,56 → 1234.56
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// DELETE all income
router.delete('/income', async (req, res) => {
  try {
    const count = await Income.destroy({ where: {}, truncate: true });
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
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
      relax_column_count: true
    });

    const toInsert = rawRecords
      .filter(raw => {
        const r = normalizeRow(raw);
        return r['ΕΠΩΝΥΜΙΑ ΠΕΛΑΤΗ ΧΟΝΔΡΙΚΗΣ'];
      })
      .map(raw => {
        const r = normalizeRow(raw);
        const amountApp = parseNum(r['ΠΟΣΟ ΓΙΑ ΑΙΤΗΣΗ']);
        const amountCollected = parseNum(r['ΠΟΣΟ']);
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
          amount_application:    amountApp,
          amount_implementation: parseNum(r['ΣΥΜΦΩΝΗΘΕΝ ΠΟΣΟ ΓΙΑ ΥΛΟΠΟΙΗΣΗ']),
          approval_date:         parseDate(r['Ημερομηνία Έγκρισης / Απόρριψης']),
          completion_deadline:   parseDate(r['Προθεσμία Ολοκλήρωσης']),
          investment_height:     parseNum(r['ΥΨΟΣ ΕΠΕΝΔΥΣΗΣ']),
          total_debts:           parseNum(r['ΣΥΝΟΛΟ ΟΦΕΙΛΩΝ']),
          source_referral:       r['ΠΡΟΕΛΕΥΣΗ - ΣΥΣΤΑΣΗ'] || '',
          sales_agent:           r['Υπεύθυνος Πώλησης'] || '',
          bonus:                 parseNum(r['BONUS']) ?? (amountApp ? amountApp * 0.05 : null),
          folder_agent:          r['Υπεύθυνος Φακέλου'] || '',
          amount_collected:      amountCollected,
          vat_amount:            parseNum(r['ΦΠΑ']) ?? (amountCollected ? amountCollected * 0.24 : null),
          service_type:          r['ΕΙΔΟΣ ΥΠΗΡΕΣΙΑΣ'] || '',
          targeting_category:    r['ΚΑΤΗΓΟΡΙΑ ΣΤΟΧΟΘΕΣΙΑΣ'] || '',
          sale_date:             parseDate(r['ΗΜ.ΝΙΑ ΠΩΛΗΣΗΣ']),
          description:           r['ΑΙΤΙΟΛΟΓΙΑ - ΠΕΡΙΓΡΑΦΗ'] || '',
          invoice_number:        r['Νο'] || '',
          unsubscribe:           ['ναι','yes','true','1'].includes(String(r['UNSUBSCRIBE'] || '').toLowerCase().trim())
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
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
      relax_column_count: true
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

module.exports = router;
