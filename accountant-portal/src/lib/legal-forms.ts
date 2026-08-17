// Canonical Greek business legal-form taxonomy, built directly from the
// distinct legalStatusDescr values actually stored on Business in production
// (via GET /api/admin/legal-status-values), not guessed from AADE docs — so
// every rare form in real use (e.g. ΚΑΛΟ/Κοιν.Σ.Επ., ΝΕΠΑ, ΝΠΔΔ) is covered.
// `value` must match Business.legalStatusDescr exactly.
export interface LegalForm {
  value: string
  label: string
}

export const LEGAL_FORMS: LegalForm[] = [
  { value: 'ΑΤΟΜΙΚΗ', label: 'Ατομική Επιχείρηση' },
  { value: 'ΙΔΙΩΤΗΣ', label: 'Ιδιώτης' },
  { value: 'ΕΕ', label: 'Ετερόρρυθμη Εταιρεία (ΕΕ)' },
  { value: 'ΟΕ', label: 'Ομόρρυθμη Εταιρεία (ΟΕ)' },
  { value: 'ΜΟΝΟΠΡΟΣ ΙΔΙΩΤΙΚΗ ΚΕΦΑΛΑΙΟΥΧΙΚΗ ΕΤΑΙΡΕΙΑ', label: 'Μονοπρόσωπη Ιδιωτική Κεφαλαιουχική Εταιρεία (Μονοπρόσωπη ΙΚΕ)' },
  { value: 'ΙΔΙΩΤΙΚΗ ΚΕΦΑΛΑΙΟΥΧΙΚΗ ΕΤΑΙΡΕΙΑ', label: 'Ιδιωτική Κεφαλαιουχική Εταιρεία (ΙΚΕ)' },
  { value: 'ΑΕ', label: 'Ανώνυμη Εταιρεία (ΑΕ)' },
  { value: 'ΣΩΜΑΤΕΙΟ', label: 'Σωματείο' },
  { value: 'ΝΟΜΙΚΟ ΠΡΟΣΩΠΟ ΔΗΜΟΣΙΟΥ ΔΙΚΑΙΟΥ', label: 'Νομικό Πρόσωπο Δημοσίου Δικαίου (ΝΠΔΔ)' },
  { value: 'ΑΕ ΜΟΝΟΠΡΟΣΩΠΗ', label: 'Ανώνυμη Εταιρεία Μονοπρόσωπη' },
  { value: 'ΕΠΕ ΜΟΝΟΠΡΟΣΩΠΗ', label: 'Εταιρεία Περιορισμένης Ευθύνης Μονοπρόσωπη' },
  { value: 'ΣΥΛΛΟΓΟΣ', label: 'Σύλλογος' },
  { value: 'ΚΟΙΝΩΝΙΑ ΑΣΤΙΚΟΥ ΔΙΚΑΙΟΥ ΚΕΡΔΟΣΚΟΠΙΚΗ', label: 'Κοινωνία Αστικού Δικαίου Κερδοσκοπική' },
  { value: 'ΕΠΕ', label: 'Εταιρεία Περιορισμένης Ευθύνης (ΕΠΕ)' },
  { value: 'ΑΛΛΟ ΝΠΙΔ ΜΗ ΚΕΡΔΟΣΚΟΠΙΚΟ', label: 'Άλλο ΝΠΙΔ Μη Κερδοσκοπικό' },
  { value: 'ΑΣΤΙΚΟΣ ΣΥΝΕΤΑΙΡΙΣΜΟΣ', label: 'Αστικός Συνεταιρισμός' },
  { value: 'ΑΓΡΟΤΙΚΟΣ ΣΥΝΕΤΑΙΡΙΣΜΟΣ', label: 'Αγροτικός Συνεταιρισμός' },
  { value: 'ΥΠΟΚΑΤΑΣΤΗΜΑ ΑΛΛΟΔΑΠΗΣ ΕΤΑΙΡΙΑΣ', label: 'Υποκατάστημα Αλλοδαπής Εταιρίας' },
  { value: 'ΑΣΤΙΚΗ ΜΗ ΚΕΡΔΟΣΚΟΠΙΚΗ ΕΤΑΙΡΙΑ', label: 'Αστική Μη Κερδοσκοπική Εταιρία' },
  { value: 'ΝΕΠΑ ΝΑΥΤΙΛ ΕΤΑΙΡ ΠΛΟΙΩΝ ΑΝΑΨΥΧ Ν4926/22', label: 'Ναυτική Εταιρία Πλοίων Αναψυχής (Ν.4926/22)' },
  { value: 'ΑΛΛΗ ΕΝΩΣΗ ΠΡΟΣΩΠΩΝ ΜΗ ΚΕΡΔΟΣΚΟΠΙΚΗ', label: 'Άλλη Ένωση Προσώπων Μη Κερδοσκοπική' },
  { value: 'ΝΕΠΑ ΝΑΥΤΙΛ ΕΤΑΙΡ ΠΛΟΙΩΝ ΑΝΑΨΥΧ Ν3182/03', label: 'Ναυτική Εταιρία Πλοίων Αναψυχής (Ν.3182/03)' },
  { value: 'ΚΟΙΝΟΠΡΑΞΙΑ', label: 'Κοινοπραξία' },
  { value: 'ΔΗΜΟΤΙΚΗ ΚΟΙΝΩΦΕΛΗΣ ΕΠΙΧΕΙΡΗΣΗ', label: 'Δημοτική Κοινωφελής Επιχείρηση' },
  { value: 'ΔΙΑΧΕΙΡΙΣΗ ΠΟΛΥΚΑΤΟΙΚΙΑΣ Ή ΚΤΙΡΙΟΥ', label: 'Διαχείριση Πολυκατοικίας ή Κτιρίου' },
  { value: 'ΑΛΛΟ ΝΠΙΔ ΚΕΡΔΟΣΚΟΠΙΚΟ', label: 'Άλλο ΝΠΙΔ Κερδοσκοπικό' },
  { value: 'ΑΣΤΙΚΗ ΚΕΡΔΟΣΚΟΠΙΚΗ ΕΤΑΙΡΙΑ', label: 'Αστική Κερδοσκοπική Εταιρία' },
  { value: 'ΝΑΥΤΙΚΗ ΕΤΑΙΡΙΑ Ν.959/79', label: 'Ναυτική Εταιρία (Ν.959/79)' },
  { value: 'ΚΟΙΝΩΝΙΑ ΚΛΗΡΟΝΟΜΩΝ', label: 'Κοινωνία Κληρονόμων' },
  { value: 'ΚΟΙΝ.Σ.ΕΠ ΚΟΙΝΩΝΙΚΗ ΣΥΝΕΤΑΙΡΙΣΤΙΚΗ ΕΠΙΧ', label: 'Κοινωνική Συνεταιριστική Επιχείρηση (Κοιν.Σ.Επ. / ΚΑΛΟ)' },
]

export const LEGAL_FORM_VALUES = LEGAL_FORMS.map(f => f.value)

// A business with no recognized legal form (null/empty legalStatusDescr) has
// no active business form and is treated as a private individual (ΙΔΙΩΤΗΣ).
export function normalizeLegalForm(legalStatusDescr: string | null | undefined): string {
  const v = (legalStatusDescr || '').trim()
  return v || 'ΙΔΙΩΤΗΣ'
}

export function legalFormWhereClause(value: string) {
  if (value === 'ΙΔΙΩΤΗΣ') {
    return { OR: [{ legalStatusDescr: 'ΙΔΙΩΤΗΣ' }, { legalStatusDescr: null }, { legalStatusDescr: '' }] }
  }
  return { legalStatusDescr: value }
}
