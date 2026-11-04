// The commission/collaboration agreement text between I-MENTOR and a
// λογιστικό γραφείο. CURRENT_TEMPLATE_VERSION must bump whenever the wording
// below changes meaningfully — each signed AccountantContract row stores the
// version it was signed under, so a signed contract always shows the exact
// text the office agreed to, even after the template is edited later.
export const CURRENT_TEMPLATE_VERSION = 1

export const IMENTOR_PARTY = {
  name: 'I-MENTOR Ι.Κ.Ε.',
  afm: '802100033',
  representative: 'Αποστολάκης Χαράλαμπος του Δημητρίου',
  address: 'Παύλου Μπακογιάννη 5, Ηράκλειο, Τ.Κ. 71410',
}

export interface ContractOfficeData {
  officeOnomasia: string | null
  officeAfm: string | null
  officeAddress: string | null
  officeLegalStatus: string | null
  officeDoy: string | null
  signerName: string
}

// Rendered as an ordered list of titled clauses. Kept as structured data
// (not one HTML blob) so the signing page and the print view can both
// render it identically from one source.
export function getContractClauses(office: ContractOfficeData): { title: string; body: string }[] {
  return [
    {
      title: 'Άρθρο 1 — Συμβαλλόμενα Μέρη',
      body: `Η παρούσα σύμβαση συνεργασίας καταρτίζεται μεταξύ:\n\n` +
        `(α) Της εταιρείας με την επωνυμία «${IMENTOR_PARTY.name}», με ΑΦΜ ${IMENTOR_PARTY.afm}, νομίμως εκπροσωπούμενης από τον ${IMENTOR_PARTY.representative}, με διεύθυνση ${IMENTOR_PARTY.address} (εφεξής «I-MENTOR»),\n\n` +
        `και\n\n` +
        `(β) Του λογιστικού γραφείου με την επωνυμία «${office.officeOnomasia || '—'}», με ΑΦΜ ${office.officeAfm || '—'}${office.officeLegalStatus ? ` (${office.officeLegalStatus})` : ''}, με έδρα ${office.officeAddress || '—'}${office.officeDoy ? `, ΔΟΥ ${office.officeDoy}` : ''}, νομίμως εκπροσωπούμενου για τους σκοπούς της παρούσας από τον/την ${office.signerName} (εφεξής «Λογιστικό Γραφείο»),\n\n` +
        `από κοινού καλούμενα «τα Μέρη».`,
    },
    {
      title: 'Άρθρο 2 — Αντικείμενο της Σύμβασης',
      body: `Το Λογιστικό Γραφείο καταχωρεί επιχειρήσεις-πελάτες του στην ηλεκτρονική πλατφόρμα «Logistis» της I-MENTOR, με σκοπό την ενημέρωσή τους για διαθέσιμες χρηματοδοτικές ευκαιρίες (ενδεικτικά: προγράμματα ΕΣΠΑ, LEADER, Αναπτυξιακού Νόμου, ΔΥΠΑ, μικροχρηματοδοτήσεις) καθώς και για υπηρεσίες αναδιάρθρωσης/ρύθμισης οφειλών (ενδεικτικά: εξωδικαστικός μηχανισμός, πτωχευτική διαδικασία), τις οποίες αναλαμβάνει να υλοποιήσει η I-MENTOR.`,
    },
    {
      title: 'Άρθρο 3 — Αμοιβή / Προμήθεια',
      body: `Για κάθε επιχείρηση-πελάτη που παραπέμπεται μέσω του Λογιστικού Γραφείου και προχωρά σε ανάθεση υπηρεσίας προς την I-MENTOR, το Λογιστικό Γραφείο λαμβάνει προμήθεια. Το ύψος της προμήθειας διαφοροποιείται ανά πρόγραμμα ή υπηρεσία και καθορίζεται ξεχωριστά, όπως αυτό εμφανίζεται στην ενότητα «Προμήθειες» της πλατφόρμας, η οποία ενημερώνεται από την I-MENTOR κατά περίπτωση. Η προμήθεια καταβάλλεται σύμφωνα με τους όρους πληρωμής που ισχύουν για το εκάστοτε πρόγραμμα/υπηρεσία.`,
    },
    {
      title: 'Άρθρο 4 — Υποχρεώσεις Λογιστικού Γραφείου',
      body: `Το Λογιστικό Γραφείο δηλώνει ότι έχει τη συναίνεση των πελατών του για την καταχώρισή τους στην πλατφόρμα και την επικοινωνία μαζί τους για τους ανωτέρω σκοπούς, και αναλαμβάνει να ενημερώνει την I-MENTOR για οποιαδήποτε ανάκληση της συναίνεσης αυτής.`,
    },
    {
      title: 'Άρθρο 5 — Μη Αποκλειστικότητα',
      body: `Η παρούσα συνεργασία δεν είναι αποκλειστική. Κάθε Μέρος διατηρεί το δικαίωμα να συνάπτει αντίστοιχες συνεργασίες με τρίτους.`,
    },
    {
      title: 'Άρθρο 6 — Εμπιστευτικότητα',
      body: `Τα Μέρη αναλαμβάνουν να τηρούν εμπιστευτικά τα στοιχεία πελατών και κάθε πληροφορία που ανταλλάσσεται στο πλαίσιο της παρούσας συνεργασίας, και να τηρούν την κείμενη νομοθεσία περί προστασίας προσωπικών δεδομένων (Κανονισμός ΕΕ 2016/679).`,
    },
    {
      title: 'Άρθρο 7 — Διάρκεια & Καταγγελία',
      body: `Η παρούσα σύμβαση ισχύει από την ημερομηνία ηλεκτρονικής υπογραφής της και για αόριστο χρόνο. Κάθε Μέρος δύναται να την καταγγείλει οποτεδήποτε, εγγράφως, χωρίς αυτό να θίγει τις εκκρεμείς υποχρεώσεις (ενδεικτικά: οφειλόμενες προμήθειες) που έχουν ήδη γεννηθεί μέχρι την ημερομηνία καταγγελίας.`,
    },
    {
      title: 'Άρθρο 8 — Εφαρμοστέο Δίκαιο',
      body: `Η παρούσα διέπεται από το Ελληνικό Δίκαιο. Για κάθε διαφορά που τυχόν προκύψει από την παρούσα, αρμόδια ορίζονται τα Δικαστήρια Ηρακλείου.`,
    },
  ]
}
