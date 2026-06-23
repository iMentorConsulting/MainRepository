'use client'
// Temporary local-only demo of the Ερμής public flow with mock data, since
// this sandbox has no DB connection to generate a real /match/[token] link.
// Not linked from anywhere; safe to delete after manual testing.
import { Sparkles } from 'lucide-react'
import { EligibilityChecker } from '@/components/programs/eligibility-checker'

// Real program: ΠΑΡΑΓΟΥΜΕ ΣΤΗΝ ΕΛΛΑΔΑ — otherRequirements transcribed verbatim
// from the live admin edit page (logistis.i-mentor.gr/programs/.../edit),
// "ΑΛΛΕΣ ΠΡΟΫΠΟΘΕΣΕΙΣ" section, items 1-11.
const mockProgram = {
  title: 'ΠΑΡΑΓΟΥΜΕ ΣΤΗΝ ΕΛΛΑΔΑ',
  minInvestment: 100000,
  maxInvestment: 400000,
  minSubsidyPct: 50,
  maxSubsidyPct: 55,
  minInterestRate: null,
  maxInterestRate: null,
  otherRequirements: [
    '1. Να έχει τουλάχιστον μία (1) πλήρη κλεισμένη διαχειριστική χρήση πριν την ημερομηνία ηλεκτρονικής υποβολής της αίτησης χρηματοδότησης.',
    '2. Να διαθέτουν τον/τους επιλέξιμο/ους ΚΑΔ επένδυσης πριν την ημερομηνία υποβολής της αίτησης. Δηλαδή μπορεί ο ΚΑΔ να προστεθεί ως νέος πριν την υποβολή της αίτησης.',
    '3. Να έχει τουλάχιστον μία (1) ΕΜΕ εξαρτημένης εργασίας κατά το ημερολογιακό έτος που προηγείται της υποβολής της αίτησης χρηματοδότησης (βάσει στοιχείων ΕΡΓΑΝΗ).',
    '4. Ο συνολικός επιχορηγούμενος προϋπολογισμός του επενδυτικού σχεδίου δεν δύναται να υπερβαίνει το διπλάσιο του υψηλότερου κύκλου εργασιών που επετεύχθη σε μία από τις τρεις (ή λιγότερες) κλεισμένες διαχειριστικές περιόδους του έτους που προηγείται της υποβολής, με ανώτερο όριο ενίσχυσης 200.000€ (ή 220.000€ για ταχεία υλοποίηση).',
    '5. Να προσκομίσει αποδεικτικά στοιχεία εξασφάλισης της Ίδιας Συμμετοχής σε ποσοστό τουλάχιστον 25% του αιτούμενου επιχορηγούμενου προϋπολογισμού.',
    '6. Η αίτηση χρηματοδότησης να συγκεντρώνει κατ\' ελάχιστο τον βαθμό 75 κατά την αυτοαξιολόγηση του επενδυτικού σχεδίου με βάση τα κριτήρια αξιολόγησης του Παραρτήματος ΙΙΙ.',
    '7. Να λειτουργεί νόμιμα διαθέτοντας το κατάλληλο έγγραφο αδειοδότησης. Στην περίπτωση που η άδεια δεν έχει εκδοθεί ή έχει λήξει, απαιτείται η προσκόμιση σχετικής αίτησης έκδοσης/ανανέωσης ή εγγράφου που τεκμαίρει την έναρξη της διαδικασίας αδειοδότησης.',
    '8. Να μη συστεγάζεται με άλλη επιχείρηση κατά τρόπο που θα επέτρεπε τη χρήση του εξοπλισμού της ενισχυόμενης επένδυσης από άλλη επιχείρηση.',
    '9. Δεν γίνονται δεκτές επιχειρήσεις με τόπο υλοποίησης την κατοικία του Δικαιούχου (κύρια ή δευτερεύουσα).',
    '10. Υποχρέωση επίτευξης στόχου παραγωγικής αποδοτικότητας (Δείκτες ΔΠΑ) μετά την ολοκλήρωση, επί ποινή επιστροφής του 10% της ληφθείσας επιχορήγησης σε περίπτωση μη επίτευξης.',
    '11. Υποχρέωση διατήρησης κατά 12μηνο πριν το τελικό αίτημα επαλήθευσης των ΕΜΕ μισθωτής εργασίας που διέθετε η επιχείρηση το 12μηνο πριν την υποβολή της αίτησης χρηματοδότησης.',
  ].join('\n'),
  extraCriteriaLabels: [],
}

// No ANTHROPIC_API_KEY in this sandbox, so this hand-simulates what
// classifyEligibilityRequirements (src/lib/eligibility-ai.ts) should produce
// for the real text above, applying the same three rules:
//  - genuinely answerable -> "ask", plain wording, correct expectedAnswer
//    direction (items 8/9 are disqualifying conditions phrased negatively —
//    rephrased as a plain positive question, Όχι is the eligible answer)
//  - accountant-only data -> skip (Π/Υ-vs-κύκλο εργασιών, βαθμολογία 75,
//    ΕΜΕ από ΕΡΓΑΝΗ — these need actual figures, not a casual yes/no)
//  - post-approval obligation, not an eligibility criterion -> skip
//    (items 10/11: penalty/refund and post-completion ΕΜΕ retention)
const mockOverrides = {
  'req-0': { label: 'Λειτουργεί η επιχείρηση τουλάχιστον από πριν το προηγούμενο πλήρες οικονομικό έτος (έχει δηλαδή τουλάχιστον μία κλεισμένη χρήση)?', expectedAnswer: true },
  'req-1': { label: 'Διαθέτετε ήδη (ή μπορείτε να προσθέσετε πριν την υποβολή) τον ΚΑΔ της επένδυσης;', expectedAnswer: true },
  'req-2': { skip: true, skipReason: 'Χρειάζεται τον ακριβή αριθμό ΕΜΕ βάσει στοιχείων ΕΡΓΑΝΗ — μόνο ο λογιστής το γνωρίζει με βεβαιότητα.' },
  'req-3': { skip: true, skipReason: 'Συγκριτικός υπολογισμός προϋπολογισμού έναντι κύκλου εργασιών τριετίας — απαιτεί λογιστικά στοιχεία, όχι κάτι που απαντιέται σε συνομιλία.' },
  'req-4': { label: 'Μπορείτε να καλύψετε τουλάχιστον το 25% του προϋπολογισμού της επένδυσης με δικά σας κεφάλαια (ίδια συμμετοχή);', expectedAnswer: true },
  'req-5': { skip: true, skipReason: 'Βαθμολογία αυτοαξιολόγησης βάσει του Παραρτήματος ΙΙΙ — υπολογίζεται από τον λογιστή/σύμβουλο κατά την υποβολή, δεν απαντιέται απευθείας.' },
  'req-6': { label: 'Λειτουργεί η επιχείρηση νόμιμα με την απαιτούμενη άδεια λειτουργίας σε ισχύ (ή έχει ήδη ξεκινήσει η διαδικασία έκδοσης/ανανέωσής της);', expectedAnswer: true },
  'req-7': { label: 'Συστεγάζεστε με άλλη επιχείρηση με τρόπο που θα της επέτρεπε να χρησιμοποιήσει τον εξοπλισμό της επένδυσης;', expectedAnswer: false },
  'req-8': { label: 'Ο τόπος υλοποίησης της επένδυσης είναι η κατοικία σας (κύρια ή δευτερεύουσα);', expectedAnswer: false },
  'req-9': { skip: true, skipReason: 'Υποχρέωση επίτευξης δείκτη παραγωγικής αποδοτικότητας μετά την ολοκλήρωση, με ποινή επιστροφής 10% — μεταγενέστερη υποχρέωση, όχι κριτήριο επιλεξιμότητας πριν την υποβολή.' },
  'req-10': { skip: true, skipReason: 'Υποχρέωση διατήρησης ΕΜΕ για 12μηνο πριν την τελική επαλήθευση — μεταγενέστερη υποχρέωση μετά την έγκριση, όχι κριτήριο επιλεξιμότητας.' },
}

export default function ErmisDemoPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 max-w-xl w-full">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mx-auto mb-4">
            <Sparkles size={24} />
          </div>
          <h1 className="text-lg font-bold text-slate-900 mb-1">Ερμής</h1>
          <p className="text-sm text-slate-500">Ο ψηφιακός σύμβουλος επιλεξιμότητας του I-MENTOR</p>
        </div>
        <p className="text-sm text-slate-700 mb-4 text-center">Γεια σου ΔΟΚΙΜΗ ΑΕ!</p>
        <EligibilityChecker
          program={mockProgram}
          autoConfirmedReasons={[
            'Επιλέξιμος ΚΑΔ: 47.11 (Λιανικό εμπόριο)',
            'Επιλέξιμη περιφέρεια: Αττική',
            'Επιλέξιμη ημερομηνία ίδρυσης: 15/03/2021',
          ]}
          overrides={mockOverrides}
        />
      </div>
    </div>
  )
}
