import Link from 'next/link'
import { Shield } from 'lucide-react'

export const metadata = {
  title: 'Συμφωνία Κοινής Επεξεργασίας — I-MENTOR Portal',
}

export default function DpaPage() {
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
        <h1 className="text-3xl font-bold text-slate-900 mb-1">Συμφωνία Κοινής Επεξεργασίας Δεδομένων</h1>
        <p className="text-slate-500 text-sm mb-4">Άρθρο 26 ΓΚΠΔ (Κανονισμός ΕΕ 2016/679) — Τελευταία ενημέρωση: Ιούνιος 2026</p>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-900 mb-8">
          <strong>Σημείωση:</strong> Αυτή η συμφωνία καθορίζει πώς η I-MENTOR IKE και κάθε λογιστικό γραφείο που χρησιμοποιεί το Portal είναι από κοινού υπεύθυνοι επεξεργασίας για τα δεδομένα των επιχειρηματικών πελατών τους. Η αποδοχή των <Link href="/terms" className="text-amber-700 hover:underline">Όρων Χρήσης</Link> συνεπάγεται αποδοχή και της παρούσας.
        </div>

        <div className="space-y-8 text-slate-700 text-sm leading-relaxed">

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">1. Μέρη της Συμφωνίας</h2>
            <p className="mb-2"><strong>Κοινός Υπεύθυνος Α:</strong> I-MENTOR IKE, ΑΦΜ 802100033, Ροδιά, Ηράκλειο Κρήτης 71500 (εφεξής «I-MENTOR»)</p>
            <p><strong>Κοινός Υπεύθυνος Β:</strong> Κάθε εγγεγραμμένο Λογιστικό Γραφείο που χρησιμοποιεί το I-MENTOR Portal (εφεξής «Λογιστής»)</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">2. Αντικείμενο και Κατηγορίες Δεδομένων</h2>
            <p className="mb-2">Τα δεδομένα που υπόκεινται σε κοινή επεξεργασία αφορούν επιχειρήσεις-πελάτες του Λογιστή:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Αναγνωριστικά στοιχεία: ΑΦΜ, επωνυμία, νομική μορφή</li>
              <li>Επικοινωνία: email, τηλέφωνο, Viber, ταχυδρομική διεύθυνση</li>
              <li>Οικονομική δραστηριότητα: ΚΑΔ (από δημόσιο μητρώο ΑΑΔΕ)</li>
              <li>Ιστορικό επικοινωνιών: αποστολές email/Viber, ανοίγματα, αποαποστολές</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">3. Σκοποί Επεξεργασίας</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700">
                    <th className="text-left px-4 py-2 border border-slate-200 font-semibold">Σκοπός</th>
                    <th className="text-left px-4 py-2 border border-slate-200 font-semibold">Υπεύθυνος</th>
                    <th className="text-left px-4 py-2 border border-slate-200 font-semibold">Νομική βάση</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Αποστολή καμπανιών για λογαριασμό Λογιστή', 'Αμφότεροι', 'Εκτέλεση σύμβασης'],
                    ['Αντιστοίχιση με επιδοτούμενα προγράμματα', 'I-MENTOR', 'Έννομο συμφέρον'],
                    ['Αναζήτηση ΑΦΜ στο ΑΑΔΕ/GSIS', 'I-MENTOR', 'Νόμιμη βάση (δημ. δεδομένα)'],
                    ['Βελτίωση αλγορίθμων αντιστοίχισης', 'I-MENTOR', 'Έννομο συμφέρον'],
                    ['Εσωτερική λογιστική/νομική συμμόρφωση', 'Έκαστος', 'Νομική υποχρέωση'],
                  ].map(([scope, party, basis], i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="px-4 py-2 border border-slate-200">{scope}</td>
                      <td className="px-4 py-2 border border-slate-200">{party}</td>
                      <td className="px-4 py-2 border border-slate-200">{basis}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">4. Κατανομή Ευθυνών</h2>

            <h3 className="font-semibold text-slate-800 mb-2">4.1 Υποχρεώσεις I-MENTOR</h3>
            <ul className="list-disc pl-5 space-y-1 mb-5">
              <li>Ασφαλής λειτουργία και φιλοξενία της πλατφόρμας (TLS, κρυπτογράφηση, backups)</li>
              <li>Τεχνική απομόνωση δεδομένων ανά λογιστικό γραφείο</li>
              <li>Απάντηση σε αιτήματα διαγραφής εντός 30 ημερών</li>
              <li>Γνωστοποίηση παραβίασης ασφαλείας εντός 72 ωρών (ΓΚΠΔ Άρθρο 33)</li>
              <li>Διατήρηση Αρχείου Δραστηριοτήτων Επεξεργασίας (ΓΚΠΔ Άρθρο 30)</li>
              <li>Ενημέρωση Λογιστή για τροποποιήσεις που επηρεάζουν GDPR συμμόρφωση</li>
            </ul>

            <h3 className="font-semibold text-slate-800 mb-2">4.2 Υποχρεώσεις Λογιστή</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>Νόμιμη συλλογή δεδομένων επιχειρήσεων-πελατών</li>
              <li>Εξασφάλιση νόμιμης βάσης (συγκατάθεση ή έννομο συμφέρον) πριν κάθε αποστολή</li>
              <li>Ακρίβεια και επικαιροποίηση δεδομένων</li>
              <li>Διαχείριση αιτημάτων αποαποστολής (unsubscribe) από τους πελάτες τους</li>
              <li>Ενημέρωση επιχειρήσεων-πελατών ότι τα δεδομένα τους επεξεργάζεται και το I-MENTOR</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">5. Ενιαίο Σημείο Επαφής για Υποκείμενα</h2>
            <p className="mb-2">
              Σύμφωνα με το Άρθρο 26§2 ΓΚΠΔ, τα υποκείμενα δεδομένων (επιχειρήσεις-πελάτες) μπορούν να ασκήσουν τα δικαιώματά τους απευθυνόμενα σε οποιοδήποτε Μέρος:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Στο Λογιστικό Γραφείο τους (ως άμεση επαφή)</li>
              <li>Στο I-MENTOR: <a href="mailto:info@i-mentor.gr" className="text-indigo-600 hover:underline">info@i-mentor.gr</a></li>
            </ul>
            <p className="mt-3">Το Μέρος που λαμβάνει το αίτημα ενημερώνει το άλλο και συντονίζεται για εκτέλεση.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">6. Υπεργολάβοι / Εκτελούντες Επεξεργασία</h2>
            <p className="mb-2">Το I-MENTOR χρησιμοποιεί τους ακόλουθους εκτελούντες επεξεργασία:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Railway.app</strong> — IaaS/φιλοξενία, EU data centers</li>
              <li><strong>SMTP provider</strong> — αποστολή email</li>
              <li><strong>Chatwoot</strong> — Viber messaging (εφόσον ενεργοποιηθεί)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">7. Διατήρηση και Διαγραφή</h2>
            <p>
              Δεδομένα επιχειρήσεων διατηρούνται ενόσω ο λογαριασμός Λογιστή είναι ενεργός. Μετά τον τερματισμό, δεδομένα διαγράφονται εντός 90 ημερών, εκτός αν νόμος απαιτεί μεγαλύτερη διατήρηση.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">8. Τροποποίηση</h2>
            <p>
              Τροποποίηση της παρούσας γνωστοποιείται 30 ημέρες νωρίτερα μέσω email και μέσω της πλατφόρμας.
            </p>
          </section>

        </div>

        <div className="flex gap-6 text-sm text-slate-500 pt-8 mt-8 border-t border-slate-200">
          <Link href="/security" className="hover:text-indigo-600">Ασφάλεια</Link>
          <Link href="/privacy" className="hover:text-indigo-600">Απόρρητο</Link>
          <Link href="/terms" className="hover:text-indigo-600">Όροι Χρήσης</Link>
          <Link href="/login" className="hover:text-indigo-600">Σύνδεση</Link>
        </div>
      </main>
    </div>
  )
}
