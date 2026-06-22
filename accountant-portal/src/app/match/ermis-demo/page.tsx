'use client'
// Temporary local-only demo of the Ερμής public flow with mock data, since
// this sandbox has no DB connection to generate a real /match/[token] link.
// Not linked from anywhere; safe to delete after manual testing.
import { Sparkles } from 'lucide-react'
import { EligibilityChecker } from '@/components/programs/eligibility-checker'

const mockProgram = {
  title: 'ΞΕΚΙΝΩ ΕΠΙΧΕΙΡΗΜΑΤΙΚΑ',
  minInvestment: 20000,
  maxInvestment: 200000,
  minSubsidyPct: 50,
  maxSubsidyPct: 50,
  minInterestRate: null,
  maxInterestRate: null,
  otherRequirements: [
    '1. Η επιχείρηση δεν πρέπει να έχει λάβει επιχορήγηση από άλλο πρόγραμμα για τις ίδιες δαπάνες τα τελευταία 3 χρόνια.',
    '2. Απαιτείται η διατήρηση τουλάχιστον 2 ΕΜΕ μισθωτής εργασίας για ένα έτος μετά την ολοκλήρωση του επενδυτικού σχεδίου.',
    '3. Σε περίπτωση μη τήρησης των όρων, η επιχείρηση οφείλει να επιστρέψει την επιχορήγηση εντόκως.',
    '4. Ο κύκλος εργασιών από τον επιλέξιμο ΚΑΔ πρέπει να αντιστοιχεί τουλάχιστον στο 70% του συνολικού κύκλου εργασιών της επιχείρησης.',
    '5. Η επιχείρηση να διαθέτει ενεργό τραπεζικό λογαριασμό στον οποίο θα κατατεθεί η επιχορήγηση.',
  ].join('\n'),
  extraCriteriaLabels: [],
}

// Pretend an admin already ran "Δημιουργία με AI" and reviewed/saved it:
// req-1 (no-double-funding) and req-5 (bank account) -> ask, plain wording
// req-2 (ΕΜΕ) -> ask, ΕΜΕ explained in plain words
// req-3 (refund clause) -> skipped, post-approval obligation
// req-4 (ΚΑΔ revenue %) -> skipped, accountant-only data
const mockOverrides = {
  // "Δεν πρέπει να έχετε λάβει..." -> phrasing the question positively
  // ("Έχετε λάβει...;") means Όχι is the eligible answer, not Ναι.
  'req-0': { label: 'Έχετε λάβει επιχορήγηση από άλλο πρόγραμμα για τις ίδιες δαπάνες τα τελευταία 3 χρόνια;', expectedAnswer: false },
  'req-1': { label: 'Μπορείτε να διατηρήσετε προσωπικό που αντιστοιχεί σε τουλάχιστον 2 εργαζομένους πλήρους απασχόλησης (ή ισοδύναμο, π.χ. 4 με μισή απασχόληση) για έναν χρόνο μετά το πρόγραμμα;', expectedAnswer: true },
  'req-2': { skip: true, skipReason: 'Ρήτρα επιστροφής της επιχορήγησης — μεταγενέστερη υποχρέωση, όχι κριτήριο επιλεξιμότητας.' },
  'req-3': { skip: true, skipReason: 'Χρειάζεται ποσοστό κύκλου εργασιών ανά ΚΑΔ — μόνο ο λογιστής το γνωρίζει.' },
  'req-4': { label: 'Έχετε ενεργό τραπεζικό λογαριασμό στο όνομα της επιχείρησης;', expectedAnswer: true },
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
