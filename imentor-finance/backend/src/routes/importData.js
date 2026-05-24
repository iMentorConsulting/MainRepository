const router = require('express').Router();
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const Income = require('../models/Income');
const Expense = require('../models/Expense');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function parseDate(v) {
  if (!v || String(v).trim() === '') return null;
  const s = String(v).trim();
  // DD/MM/YYYY or DD/MM/YY
  const match = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (match) {
    let [, d, m, y] = match;
    if (y.length === 2) y = '20' + y;
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  // YYYY-MM-DD passthrough
  if (s.match(/^\d{4}-\d{2}-\d{2}$/)) return s;
  return null;
}

function parseNum(v) {
  if (!v || String(v).trim() === '') return null;
  const s = String(v).replace(/[€$,\s]/g, '').replace(',', '.').trim();
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// Import ΕΣΟΔΑ CSV
router.post('/income', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Δεν βρέθηκε αρχείο' });

    const content = req.file.buffer.toString('utf-8');
    const records = parse(content, { columns: true, skip_empty_lines: true, trim: true, bom: true });

    const toInsert = records.map(r => ({
      customer_name:         r['ΕΠΩΝΥΜΙΑ ΠΕΛΑΤΗ ΧΟΝΔΡΙΚΗΣ'] || r['customer_name'] || '',
      work_status:           r['ΚΑΤΑΣΤΑΣΗ ΕΡΓΑΣΙΑΣ'] || r['work_status'] || '',
      email:                 r['EMAIL'] || r['email'] || '',
      phone:                 r['ΚΙΝΗΤΟ'] || r['phone'] || '',
      city:                  r['ΠΟΛΗ ή ΠΕΡΙΦΕΡΙΑ'] || r['city'] || '',
      postal_code:           r['ΤΚ'] || r['postal_code'] || '',
      address:               r['ΔΙΕΥΘΥΝΣΗ'] || r['address'] || '',
      vat_number:            r['ΑΦΜ'] || r['vat_number'] || '',
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
      bonus:                 parseNum(r['BONUS']),
      folder_agent:          r['Υπεύθυνος Φακέλου'] || '',
      amount_collected:      parseNum(r['ΠΟΣΟ']),
      vat_amount:            parseNum(r['ΦΠΑ']),
      service_type:          r['ΕΙΔΟΣ ΥΠΗΡΕΣΙΑΣ'] || '',
      targeting_category:    r['ΚΑΤΗΓΟΡΙΑ ΣΤΟΧΟΘΕΣΙΑΣ'] || '',
      sale_date:             parseDate(r['ΗΜ.ΝΙΑ ΠΩΛΗΣΗΣ']),
      description:           r['ΑΙΤΙΟΛΟΓΙΑ - ΠΕΡΙΓΡΑΦΗ'] || '',
      invoice_number:        r['Νο'] || '',
      unsubscribe:           String(r['UNSUBSCRIBE'] || '').toLowerCase().includes('ναι') || String(r['UNSUBSCRIBE'] || '').toLowerCase() === 'true'
    }));

    const inserted = await Income.bulkCreate(toInsert, { validate: false });
    res.json({ imported: inserted.length, total: records.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Import ΕΞΟΔΑ CSV (works for both ΕΞΟΔΑ and ΕΞΟΔΑ2 sheets)
router.post('/expenses', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Δεν βρέθηκε αρχείο' });
    const { source_sheet = 'ΕΞΟΔΑ' } = req.body;

    const content = req.file.buffer.toString('utf-8');
    // ΕΞΟΔΑ has headers on row 2 — skip first row
    let csvContent = content;
    const lines = content.split('\n');
    if (lines.length > 1 && !lines[0].includes('ΗΜ.ΝΙΑ') && !lines[0].includes('date')) {
      csvContent = lines.slice(1).join('\n');
    }

    const records = parse(csvContent, { columns: true, skip_empty_lines: true, trim: true, bom: true });

    const toInsert = records
      .filter(r => r['ΗΜ.ΝΙΑ'] || r['date'])
      .map(r => ({
        date:            parseDate(r['ΗΜ.ΝΙΑ'] || r['date']) || null,
        amount:          parseNum(r['ΠΟΣΟ'] || r['amount']) || 0,
        category:        r['ΓΕΝΙΚΗ ΚΑΤΗΓΟΡΙΑ ΕΞΟΔΩΝ-ΑΓΟΡΩΝ'] || r['category'] || '',
        supplier:        r['ΠΡΟΜΗΘΕΥΤΗΣ / ΥΠΑΛΛΗΛΟΣ / ΣΥΝΕΡΓΑΤΗΣ'] || r['supplier'] || '',
        related_service: r['ΤΟ ΕΞΟΔΟ ΑΦΟΡΑ ΠΟΙΑ ΥΠΗΡΕΣΙΑ'] || r['related_service'] || '',
        description:     r['ΑΙΤΙΟΛΟΓΙΑ - ΠΕΡΙΓΡΑΦΗ'] || r['description'] || '',
        source_sheet
      }));

    const inserted = await Expense.bulkCreate(toInsert, { validate: false });
    res.json({ imported: inserted.length, total: records.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
