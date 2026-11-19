import Link from 'next/link'
import { Shield } from 'lucide-react'

export const metadata = {
  title: 'Πολιτική Απορρήτου — I-MENTOR Portal',
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <Shield size={16} className="text-white" />
            </div>
            <span className="font-bold text-slate-900 text-lg">I-MENTOR Portal</span>
          </div>
          <Link href="/login" className="text-sm text-indigo-600 hover:underline">← Σύνδεση</Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-slate-900 mb-1">Πολιτική Απορρήτου</h1>
        <p className="text-slate-500 text-sm mb-10">Τελευταία ενημέρωση: Ιούνιος 2026</p>

        <div className="space-y-8 text-slate-700 text-sm leading-relaxed">

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">1. Υπεύθυνοι Επεξεργασίας</h2>
            <p className="mb-3">
              Το I-MENTOR Portal λειτουργεί υπό καθεστώς <strong>Κοινής Επεξεργασίας</strong> (Άρθρο 26 ΓΚΠΔ) μεταξύ:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>I-MENTOR IKE</strong> («I-MENTOR») — ΑΦΜ 802100033, Ροδιά, Ηράκλειο Κρήτης 71500</li>
              <li><strong>Λογιστικό Γραφείο</strong> («Λογιστής») — κάθε εγγεγραμμένο λογιστικό γραφείο που χρησιμοποιεί την πλατφόρμα</li>
            </ul>
            <p className="mt-3">
              Η κατανομή ευθυνών μεταξύ Κοινών Υπευθύνων ορίζεται στη <Link href="/dpa" className="text-indigo-600 hover:underline">Συμφωνία Κοινής Επεξεργασίας</Link>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">2. Δεδομένα που Επεξεργαζόμαστε</h2>

            <h3 className="font-semibold text-slate-800 mb-2">2.1 Δεδομένα Λογιστικών Γραφείων (Χρηστών)</h3>
            <ul className="list-disc pl-5 space-y-1 mb-4">
              <li>Ονοματεπώνυμο, email, τηλέφωνο</li>
              <li>Στοιχεία λογιστικού γραφείου (επωνυμία, ΑΦΜ, διεύθυνση)</li>
              <li>Αρχείο ενεργειών (audit log)</li>
            </ul>

            <h3 className="font-semibold text-slate-800 mb-2">2.2 Δεδομένα Επιχειρήσεων-Πελατών</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>ΑΦΜ, επωνυμία, νομική μορφή</li>
              <li>Email, τηλέφωνο, Viber</li>
              <li>Ταχυδρομική διεύθυνση, ΤΚ</li>
              <li>ΚΑΔ (κωδικοί δραστηριότητας — από δημόσιο μητρώο ΑΑΔΕ)</li>
              <li>Ιστορικό αποστολών καμπανιών</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">3. Νομικές Βάσεις Επεξεργασίας</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Εκτέλεση σύμβασης</strong> (Άρθρο 6§1β): Λειτουργία της πλατφόρμας</li>
              <li><strong>Νόμιμο συμφέρον</strong> (Άρθρο 6§1στ): Ασφάλεια, fraud prevention, audit logging</li>
              <li><strong>Συγκατάθεση</strong> (Άρθρο 6§1α): Αποστολή marketing επικοινωνιών στις επιχειρήσεις</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">4. Διαβίβαση σε Τρίτους</h2>
            <p className="mb-2">Δεδομένα διαβιβάζονται μόνο σε:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Railway.app</strong> — φιλοξενία (EU data centers)</li>
              <li><strong>ΑΑΔΕ/GSIS</strong> — αναζήτηση βασικών στοιχείων μητρώου</li>
              <li><strong>SMTP provider</strong> — αποστολή email καμπανιών</li>
              <li><strong>Chatwoot</strong> — αποστολή Viber μηνυμάτων (εφόσον ενεργοποιηθεί)</li>
            </ul>
            <p className="mt-3">Δεν πωλούνται δεδομένα σε τρίτους. Δεν γίνεται διαβίβαση εκτός ΕΕ/ΕΟΧ.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">5. Δικαιώματά σας (ΓΚΠΔ)</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Πρόσβαση</strong> (Άρθρο 15): Εξαγωγή δεδομένων μέσω Ρυθμίσεων → Excel</li>
              <li><strong>Διόρθωση</strong> (Άρθρο 16): Επεξεργασία στοιχείων απευθείας στο Portal</li>
              <li><strong>Διαγραφή</strong> (Άρθρο 17): Αίτημα μέσω Ρυθμίσεων — εκτελείται εντός 30 ημερών</li>
              <li><strong>Φορητότητα</strong> (Άρθρο 20): Εξαγωγή σε XLSX μέσω Ρυθμίσεων</li>
              <li><strong>Εναντίωση</strong> (Άρθρο 21): Επικοινωνία στο info@i-mentor.gr</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">6. Διατήρηση Δεδομένων</h2>
            <p>
              Δεδομένα λογαριασμών λογιστών διατηρούνται για όσο διάστημα ο λογαριασμός είναι ενεργός, και για 12 μήνες μετά τη λήξη της σύμβασης για λόγους νομικής συμμόρφωσης. Μετά από αίτημα διαγραφής, τα δεδομένα διαγράφονται εντός 30 ημερών.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">7. Cookies</h2>
            <p>
              Χρησιμοποιούμε μόνο απαραίτητα session cookies για τον έλεγχο ταυτότητας (NextAuth.js). Δεν χρησιμοποιούμε cookies τρίτων ή analytics cookies.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">8. Επικοινωνία</h2>
            <p>
              Για θέματα προστασίας δεδομένων: <a href="mailto:info@i-mentor.gr" className="text-indigo-600 hover:underline">info@i-mentor.gr</a><br />
              Για καταγγελίες: <a href="https://www.dpa.gr" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">ΑΠΔΠΧ (www.dpa.gr)</a>
            </p>
          </section>

        </div>

        <div className="flex gap-6 text-sm text-slate-500 pt-8 mt-8 border-t border-slate-200">
          <Link href="/security" className="hover:text-indigo-600">Ασφάλεια</Link>
          <Link href="/terms" className="hover:text-indigo-600">Όροι Χρήσης</Link>
          <Link href="/dpa" className="hover:text-indigo-600">Συμφωνία Κοινής Επεξεργασίας</Link>
          <Link href="/login" className="hover:text-indigo-600">Σύνδεση</Link>
        </div>
      </main>
    </div>
  )
}
