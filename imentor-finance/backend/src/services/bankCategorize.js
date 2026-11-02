// Rule-based automatic categorization of bank movements (keyword match, accent/case-insensitive).
// Applied to debits (χρεώσεις) only — see bankIngest. First matching rule wins. A category typed by hand in the UI is never overwritten by these rules.
const { norm } = require('./bankParsers');

const RULES = [
  ['Φόροι / ΑΑΔΕ',                  ['ΑΑΔΕ', 'ΔΟΥ', 'ΦΠΑ', 'ΦΜΥ', 'ΕΝΦΙΑ', 'ΤΑΧΙΣ', 'ΦΟΡΟΣ ΕΙΣΟΔΗΜΑΤΟΣ', 'ΠΑΡΑΚΡΑΤΗΣΗ']],
  ['Ασφαλιστικές εισφορές',         ['ΕΦΚΑ', 'E-EFKA', 'ΙΚΑ', 'ΟΑΕΕ', 'ΕΤΑΑ', 'ΤΣΜΕΔΕ', 'ΑΣΦΑΛΙΣΤΙΚ']],
  ['Μισθοδοσία',                    ['ΜΙΣΘΟΔΟΣΙΑ', 'ΜΙΣΘΟΣ', 'ΑΠΟΔΟΧΕΣ', 'PAYROLL', 'SALARY']],
  ['Ενοίκιο',                       ['ΕΝΟΙΚΙΟ', 'ΜΙΣΘΩΜΑ', 'RENT']],
  ['Λογαριασμοί (ΔΕΗ/νερό/τηλ.)',   ['ΔΕΗ', 'PPC', 'HELLENIQ ENERGY', 'ΕΥΔΑΠ', 'ΕΥΑΘ', 'COSMOTE', 'VODAFONE', 'WIND', 'NOVA', 'ΟΤΕ', 'ΦΥΣΙΚΟ ΑΕΡΙΟ', 'ΗΡΩΝ', 'PROTERGIA', 'ΜΥΤΙΛΗΝΑΙΟΣ']],
  ['Τραπεζικά έξοδα / τόκοι',       ['ΕΞΟΔΑ', 'ΠΡΟΜΗΘΕΙΑ ΕΜΒΑΣΜ', 'ΠΡΟΜΗΘΕΙΑ ΤΡΑΠΕΖ', 'ΤΟΚΟΙ', 'ΕΠΙΤΟΚΙ', 'ΔΟΣΗ ΔΑΝΕΙΟΥ', 'ΔΑΝΕΙΟ', 'COMMISSION', 'FEES', 'FEE ']],
  ['Λογιστικά / Νομικά',            ['ΛΟΓΙΣΤ', 'ΔΙΚΗΓΟΡ', 'ΣΥΜΒΟΛΑΙΟΓΡ']],
  ['Καύσιμα / Μεταφορές',           ['ΚΑΥΣΙΜΑ', 'SHELL', 'BP ', 'EKO', 'AVIN', 'ΟΔΙΚΑ', 'ΔΙΟΔΙΑ', 'ΕΓΝΑΤΙΑ', 'ΟΛΥΜΠΙΑ ΟΔΟΣ']],
  ['Λογισμικό / Συνδρομές',         ['GOOGLE', 'MICROSOFT', 'ADOBE', 'ZOOM', 'ANTHROPIC', 'OPENAI', 'META ', 'FACEBK', 'AMAZON WEB', 'MOOSEND']],
];

// Short keywords (<= 4 chars, e.g. ΙΚΑ, ΟΤΕ, ΔΟΥ, BP) must match a whole word, otherwise
// 'ΙΚΑ' would hit 'ΕΛΛΗΝΙΚΑ'. Longer keywords match anywhere (prefixes like ΛΟΓΙΣΤ work).
function categorize(description = '', counterparty = '', rules = RULES) {
  const text = norm(`${counterparty} ${description}`);
  const words = new Set(text.split(/[^0-9A-ZΑ-Ω]+/).filter(Boolean));
  for (const [name, keywords] of rules) {
    const hit = keywords.some(k => {
      const kw = norm(k);
      return kw.length <= 4 && !kw.includes(' ') ? words.has(kw) : text.includes(kw);
    });
    if (hit) return name;
  }
  return '';
}

module.exports = { RULES, categorize };
