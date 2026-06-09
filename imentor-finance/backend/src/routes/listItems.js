const router = require('express').Router();
const ListItem = require('../models/ListItem');

router.get('/', async (req, res) => {
  try {
    const { list_type, active_only } = req.query;
    const where = {};
    if (list_type) where.list_type = list_type;
    if (active_only === 'true') where.is_active = true;
    const items = await ListItem.findAll({ where, order: [['sort_order', 'ASC'], ['value', 'ASC']] });
    res.json(items);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const item = await ListItem.create(req.body);
    res.status(201).json(item);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const item = await ListItem.findByPk(req.params.id);
    if (!item) return res.status(404).json({ error: 'Δεν βρέθηκε' });
    await item.update(req.body);
    res.json(item);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const item = await ListItem.findByPk(req.params.id);
    if (!item) return res.status(404).json({ error: 'Δεν βρέθηκε' });
    await item.destroy();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Seed default list items
router.post('/seed', async (req, res) => {
  try {
    const defaults = [
      ...['ΜΙΣΘΟΔΟΣΙΑ-ΕΡΓΑΤΙΚΑ','ΛΟΓΙΣΤΙΚΑ','ΠΡΟΜΗΘΕΥΤΕΣ','ΔΙΑΦΗΜΙΣΗ','ΑΝΑΛΩΣΙΜΑ','ΚΑΤΑΣΚΕΥΕΣ-ΥΠΟΔΟΜΕΣ','ΤΗΛΕΦΩΝΙΑ','ΔΗΜΟΣΙΟ','WEBSITE OVERHEAD','ΣΥΝΤΑΞΗ ΜΕΛΕΤΗΣ','ΠΡΟΜΗΘΕΙΕΣ ΣΥΣΤΑΣΗΣ ΠΕΛΑΤΩΝ','BANK FEES','COURIER','ΕΝΟΙΚΙΟ','ΜΕΣΙΤΙΚΗ ΑΜΟΙΒΗ','ΚΟΙΝΟΧΡΗΣΤΑ ΓΡΑΦΕΙΟΥ','STARTUP','SYSTEMS','SMS','ΚΑΘΑΡΙΣΜΟΣ','ΡΕΥΜΑ','INTERNET','VIBER','ΙΚΑ','ΕΞΟΠΛΙΣΜΟΣ','ΝΟΜΙΚΗ ΥΠΟΣΤΗΡΙΞΗ'].map(v => ({ list_type: 'ΚΑΤΗΓΟΡΙΕΣ_ΕΞΟΔΩΝ', value: v, is_active: true })),
      ...['FACEBOOK','GOOGLE','ADACOM','WIX','PAPAKI','WIND','MOX DIGISIGN PRIVATE LIMITED','ΔΙΑΦΟΡΟΙ','ΤΟΣΙΟΣ ΔΗΜΗΤΡΗΣ','ΧΡΙΣΤΟΦΑΚΗ ΣΤΕΛΛΑ','ΣΦΑΚΙΑΝΑΚΗΣ ΘΕΜΙΣΤΟΚΛΗΣ','ΚΙΜΩΝ ΓΕΡΟΓΙΑΝΝΑΚΗΣ','ΜΠΟΤΟΝΑΚΗΣ ΚΩΣΤΑΣ','ΑΝΔΡΟΥΛΙΔΑΚΗ ΑΓΓΕΛΙΚΗ','ΣΦΑΚΙΑΝΑΚΗΣ ΓΙΑΝΝΗΣ','ΤΖΩΡΤΖΑΚΑΚΗΣ ΑΝΤΩΝΗΣ','ΜΟΥΔΑΤΣΟΣ ΧΡΗΣΤΟΣ','ΓΕΝΙΚΗ ΤΑΧΥΔΡΟΜΙΚΗ','ΟΤΕ','ΚΑΡΤΑ ΚΙΝΗΤΟΥ','ΜΠΕΧΛΙΤΖΑΝΑΚΗΣ ΒΑΣΙΛΗΣ','ΠΑΝΤΑΓΑΚΗΣ ΤΗΛΕΜΑΧΟΣ','MOOSEND','ΑΠΟΣΤΟΛΑΚΗΣ ΣΤΕΛΙΟΣ','ΓΙΑΝΝΕΔΑΚΗΣ','WEDOO','PABBLY','MAILTRACK','FIVERR','ΔΗΜΟΣΙΟ','TIKTOK','ELORUS','ΕΛΕΥΘΕΡΙΑ','ΧΡΗΣΤΟΣ','ΣΤΕΛΛΑ','ΒΑΛΛΙΑ','ΧΑΡΗΣ','ΣΟΦΙΑ','CHATGPT','UPLEVEL','ΠΑΝΤΑΖΗΣ ΛΑΜΠΡΟΣ','PROTERGIA','ITDEV','ΜΑΝΟΥΣΑΚΗΣ ΜΑΡΙΟΣ','ΣΤΕΛΙΟΣ ΑΠΟΣΤΟΛΑΚΗΣ'].map(v => ({ list_type: 'ΠΡΟΜΗΘΕΥΤΕΣ', value: v, is_active: true })),
      ...['ΥΠΟΒΟΛΗ ΑΙΤΗΣΗΣ','ΕΝΣΤΑΣΗ','ΕΓΚΡΙΣΗ - ΠΡΙΝ ΤΟ 1ο ΑΙΤΗΜΑ','ΣΕ 1ο ΑΙΤΗΜΑ ΕΛΕΓΧΟΥ','ΣΕ 2ο ΑΙΤΗΜΑ ΕΛΕΓΧΟΥ','ΣΕ ΤΕΛΙΚΟ ΑΙΤΗΜΑ ΕΛΕΓΧΟΥ','ΟΛΟΚΛΗΡΩΜΕΝΗ - ΠΑΡΑΙΤΗΣΗ','ΟΛΟΚΛΗΡΩΜΕΝΗ - ΕΠΙΤΥΧΩΣ','ΟΛΟΚΛΗΡΩΜΕΝΗ - ΑΠΟΡΡΙΨΗ','ΟΛΟΚΛΗΡΩΜΕΝΗ - ΑΠΕΝΤΑΞΗ','ΟΛΟΚΛΗΡΩΣΗ - ΑΠΛΗ','ΟΛΟΚΛΗΡΩΜΕΝΗ - ΕΚΚΡΕΜΟΤΗΤΑ','ΑΜΕΣΗ ΕΚΚΡΕΜΟΤΗΤΑ','ΥΠΟΒΕΒΛΗΜΕΝΟ ΤΕΛΙΚΟ ΑΙΤΗΜΑ','ΑΓΝΩΣΤΟ','ΑΙΤΗΜΑ ΤΡΟΠΟΠΟΙΗΣΗΣ','ΕΛΕΓΧΟΣ ΕΠΙΛΕΞΙΜΟΤΗΤΑΣ','ΔΕΝ ΠΡΟΧΩΡΗΣΕ','ΑΝΑΜΟΝΗ ΠΙΣΤΟΠΟΙΗΤΙΚΩΝ'].map(v => ({ list_type: 'ΚΑΤΑΣΤΑΣΗ_ΕΡΓΑΣΙΑΣ', value: v, is_active: true })),
      ...['ΕΣΠΑ ΠΤΥΧΙΟΥΧΩΝ','WEB STRATEGY','ΨΗΦΙΑΚΗ ΥΠΟΓΡΑΦΗ','ΕΣΠΑ ΤΟΥΡΙΣΜΟΣ','ΕΞΩΔΙΚΑΣΤΙΚΟΣ','BUSINESS PLAN','ΑΝΑΔΙΑΡΘΡΩΣΗ','ΨΗΦΙΑΚΟ ΒΗΜΑ','ΑΝΑΔΙΑΡΘΡΩΣΗ','ΠΡΟΜΗΘΕΙΑ','ΕΣΠΑ ΕΠΙΧΕΙΡΗΜΑΤΙΚΟΤΗΤΑ','ΕΣΠΑ ΑΝΤΑΓΩΝΙΣΤΙΚΟΤΗΤΑ','ΚΟΥΠΟΝΙΑ ΤΕΧΝΟΛΟΓΙΑΣ','ΕΠΙΔΟΤΗΣΗ ΘΕΣΗΣ ΕΡΓΑΣΙΑΣ','ΕΠΙΧΕΙΡΗΜΑΤΙΚΕΣ ΑΝΑΦΟΡΕΣ','ΠΡΟΣΤΑΣΙΑ Α ΚΑΤΟΙΚΙΑΣ','ΚΡΗΤΗΣ ΨΗΦΙΑΚΗ ΑΝΑΒΑΘΜΙΣΗ','ΕΣΠΑ ΒΟΡΕΙΟΥ ΑΙΓΑΙΟΥ','ΜΗ ΕΠΙΣΤΡΕΠΤΕΑ ΕΠΙΧΟΡΗΓΗΣΗ ΚΡΗΤΗΣ','ΜΗ ΕΠΙΣΤΡΕΠΤΕΑ ΕΠΙΧΟΡΗΓΗΣΗ ΒΟΡΕΙΟΥ ΑΙΓΑΙΟΥ','ΜΗ ΕΠΙΣΤΡΕΠΤΕΑ ΕΠΙΧΟΡΗΓΗΣΗ ΑΤΤΙΚΗΣ','ΕΣΠΑ e-Λιανικό',"ΕΣΠΑ e-Λιανικό Β' Κύκλος",'ΓΕΦΥΡΑ 2','ΕΣΠΑ ΕΣΤΙΑΣΗ','ΟΑΕΔ 18-29','ΕΣΠΑ ΓΥΜΝΑΣΤΗΡΙΑ','ΕΣΠΑ ΔΙΚΗΓΟΡΟΙ','ΕΣΠΑ ΕΠΙΔΟΤΗΣΗ ΤΟΚΩΝ','ΕΣΠΑ Κ.Κ. ΤΟΥΡΙΣΜΟΣ','Σύσταση Πελατών','ΟΑΕΔ ΕΠΙΧΟΡΗΓΗΣΗ ΑΠΑΣΧΟΛΗΣΗΣ ΑΝΕΡΓΩΝ','ΕΣΠΑ ΛΟΓΙΣΤΩΝ','ΤΑΜΕΙΟ ΕΓΓΥΟΔΟΣΙΑΣ','ΕΣΠΑ ΝΟΤΙΟΥ ΑΙΓΑΙΟΥ','ΕΣΠΑ ΣΕΙΣΜΟΠΛΗΚΤΩΝ','ΠΡΑΣΙΝΟΣ ΑΓΡΟΤΟΥΡΙΣΜΟΣ','ΣΥΜΒΟΥΛΕΥΤΙΚΗ','ΑΑ ΓΗΣ','ΑΝΑΠΤΥΞΙΑΚΟΣ ΝΟΜΟΣ','ΠΤΩΧΕΥΣΗ','ΨΗΦΙΑΚΟΣ ΜΕΤΑΣΧΗΜΑΤΙΣΜΟΣ','ΠΡΑΣΙΝΗ ΠΑΡΑΓΩΓΙΚΗ ΕΠΕΝΔΥΣΗ','ΠΡΑΣΙΝΟΣ ΜΕΤΑΣΧΗΜΑΤΙΣΜΟΣ','ΔΙΑΠΡΑΓΜΑΤΕΥΣΗ','ΕΣΠΑ ΤΟΥΡΙΣΜΟΣ 2024','ΟΑΕΔ 30-55','ΕΣΠΑ ΚΑΤΑΔΥΤΙΚΟΥ ΤΟΥΡΙΣΜΟΥ','ΨΗΦΙΑΚΑ ΕΡΓΑΛΕΙΑ ΜΜΕ ΙΙ','ΟΑΕΔ 30-59','ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ','ΠΑΡΑΣΤΑΤΙΚΕΣ ΤΕΧΝΕΣ','ΕΣΠΑ ΜΑΚΕΔΟΝΙΑΣ','ΔΥΠΑ 18-29','ΔΑΝΕΙΟΔΟΤΗΣΕΙΣ','ΤΕΠΙΧ','ΕΠΙΧΕΙΡΩ ΠΡΑΣΙΝΑ ΚΡΗΤΗ','ΑΝΑΚΑΙΝΙΣΗ ΚΑΤΟΙΚΙΩΝ'].map(v => ({ list_type: 'ΕΙΔΟΣ_ΥΠΗΡΕΣΙΑΣ', value: v, is_active: true })),
      ...['ΕΛΕΥΘΕΡΙΑ','ΧΡΗΣΤΟΣ','ΣΤΕΛΛΑ','ΒΑΛΛΙΑ','ΧΑΡΗΣ','ΣΟΦΙΑ'].map(v => ({ list_type: 'ΠΡΑΚΤΟΡΕΣ', value: v, is_active: true })),
      ...['FACEBOOK','GOOGLE','TIKTOK','Referral','WEBSITE','ΣΥΣΤΑΣΗ ΠΕΛΑΤΗ','ΣΥΣΤΑΣΗ ΑΠΟ ΛΟΓΙΣΤΗ','ΣΥΣΤΑΣΗ ΑΠΟ ΝΙΚΟΛ.','ΟΑΕΔ 30-59','ΣΥΣΤΑΣΗ ΑΠΟ ΧΑΡΗ'].map(v => ({ list_type: 'ΠΗΓΗ_ΣΥΣΤΑΣΗ', value: v, is_active: true }))
    ];

    await ListItem.bulkCreate(defaults, { ignoreDuplicates: true });
    res.json({ seeded: defaults.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
