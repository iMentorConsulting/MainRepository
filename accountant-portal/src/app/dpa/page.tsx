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

      <main className="max-w-4xl mx-auto px-6 py-12 prose prose-slate max-w-none">
        <h1>Συμφωνία Κοινής Επεξεργασίας Δεδομένων</h1>
        <p className="text-slate-500 text-sm">Άρθρο 26 ΓΚΠΔ (Κανονισμός ΕΕ 2016/679) — Τελευταία ενημέρωση: Ιούνιος 2026</p>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 not-prose text-sm text-amber-900 my-6">
          <strong>Σημείωση:</strong> Αυτή η συμφωνία καθορίζει πώς η I-MENTOR Consulting και κάθε λογιστικό γραφείο που χρησιμοποιεί το Portal είναι από κοινού υπεύθυνοι επεξεργασίας για τα δεδομένα των επιχειρηματικών πελατών τους. Η αποδοχή των <Link href="/terms" className="text-amber-700 hover:underline">Όρων Χρήσης</Link> συνεπάγεται αποδοχή και της παρούσας.
        </div>

        <h2>1. Μέρη της Συμφωνίας</h2>
        <p><strong>Κοινός Υπεύθυνος Α:</strong> I-MENTOR IKE, ΑΦΜ 802100033, Ροδιά, Ηράκλειο Κρήτης 71500 (εφεξής «I-MENTOR»)</p>
        <p><strong>Κοινός Υπεύθυνος Β:</strong> Κάθε εγγεγραμμένο Λογιστικό Γραφείο που χρησιμοποιεί το I-MENTOR Portal (εφεξής «Λογιστής»)</p>

        <h2>2. Αντικείμενο και Κατηγορίες Δεδομένων</h2>
        <p>Τα δεδομένα που υπόκεινται σε κοινή επεξεργασία αφορούν επιχειρήσεις-πελάτες του Λογιστή:</p>
        <ul>
          <li>Αναγνωριστικά στοιχεία: ΑΦΜ, επωνυμία, νομική μορφή</li>
          <li>Επικοινωνία: email, τηλέφωνο, Viber, ταχυδρομική διεύθυνση</li>
          <li>Οικονομική δραστηριότητα: ΚΑΔ (από δημόσιο μητρώο ΑΑΔΕ)</li>
          <li>Ιστορικό επικοινωνιών: αποστολές email/Viber, ανοίγματα, αποαποστολές</li>
        </ul>

        <h2>3. Σκοποί Επεξεργασίας</h2>
        <table>
          <thead>
            <tr><th>Σκοπός</th><th>Υπεύθυνος</th><th>Νομική βάση</th></tr>
          </thead>
          <tbody>
            <tr><td>Αποστολή καμπανιών για λογαριασμό Λογιστή</td><td>Αμφότεροι</td><td>Εκτέλεση σύμβασης</td></tr>
            <tr><td>Αντιστοίχιση με επιδοτούμενα προγράμματα</td><td>I-MENTOR</td><td>Έννομο συμφέρον</td></tr>
            <tr><td>Αναζήτηση ΑΦΜ στο ΑΑΔΕ/GSIS</td><td>I-MENTOR</td><td>Νόμιμη βάση (δημ. δεδομένα)</td></tr>
            <tr><td>Βελτίωση αλγορίθμων αντιστοίχισης</td><td>I-MENTOR</td><td>Έννομο συμφέρον</td></tr>
            <tr><td>Εσωτερική λογιστική/νομική συμμόρφωση</td><td>Έκαστος</td><td>Νομική υποχρέωση</td></tr>
          </tbody>
        </table>

        <h2>4. Κατανομή Ευθυνών</h2>

        <h3>4.1 Υποχρεώσεις I-MENTOR</h3>
        <ul>
          <li>Ασφαλής λειτουργία και φιλοξενία της πλατφόρμας (TLS, κρυπτογράφηση, backups)</li>
          <li>Τεχνική απομόνωση δεδομένων ανά λογιστικό γραφείο</li>
          <li>Απάντηση σε αιτήματα διαγραφής εντός 30 ημερών</li>
          <li>Γνωστοποίηση παραβίασης ασφαλείας εντός 72 ωρών (ΓΚΠΔ Άρθρο 33)</li>
          <li>Διατήρηση Αρχείου Δραστηριοτήτων Επεξεργασίας (ΓΚΠΔ Άρθρο 30)</li>
          <li>Ενημέρωση Λογιστή για τροποποιήσεις που επηρεάζουν GDPR συμμόρφωση</li>
        </ul>

        <h3>4.2 Υποχρεώσεις Λογιστή</h3>
        <ul>
          <li>Νόμιμη συλλογή δεδομένων επιχειρήσεων-πελατών</li>
          <li>Εξασφάλιση νόμιμης βάσης (συγκατάθεση ή έννομο συμφέρον) πριν κάθε αποστολή</li>
          <li>Ακρίβεια και επικαιροποίηση δεδομένων</li>
          <li>Διαχείριση αιτημάτων αποαποστολής (unsubscribe) από τους πελάτες τους</li>
          <li>Ενημέρωση επιχειρήσεων-πελατών ότι τα δεδομένα τους επεξεργάζεται και το I-MENTOR</li>
        </ul>

        <h2>5. Ενιαίο Σημείο Επαφής για Υποκείμενα</h2>
        <p>
          Σύμφωνα με το Άρθρο 26§2 ΓΚΠΔ, τα υποκείμενα δεδομένων (επιχειρήσεις-πελάτες) μπορούν να ασκήσουν τα δικαιώματά τους απευθυνόμενα σε οποιοδήποτε Μέρος:
        </p>
        <ul>
          <li>Στο Λογιστικό Γραφείο τους (ως άμεση επαφή)</li>
          <li>Στο I-MENTOR: <a href="mailto:info@i-mentor.gr">info@i-mentor.gr</a></li>
        </ul>
        <p>Τo Μέρος που λαμβάνει το αίτημα ενημερώνει το άλλο και συντονίζεται για εκτέλεση.</p>

        <h2>6. Υπεργολάβοι / Εκτελούντες Επεξεργασία</h2>
        <p>Το I-MENTOR χρησιμοποιεί τους ακόλουθους εκτελούντες επεξεργασία:</p>
        <ul>
          <li><strong>Railway.app</strong> — IaaS/φιλοξενία, EU data centers</li>
          <li><strong>SMTP provider</strong> — αποστολή email</li>
          <li><strong>Chatwoot</strong> — Viber messaging (εφόσον ενεργοποιηθεί)</li>
        </ul>

        <h2>7. Διατήρηση και Διαγραφή</h2>
        <p>
          Δεδομένα επιχειρήσεων διατηρούνται ενόσω ο λογαριασμός Λογιστή είναι ενεργός. Μετά τον τερματισμό, δεδομένα διαγράφονται εντός 90 ημερών, εκτός αν νόμος απαιτεί μεγαλύτερη διατήρηση.
        </p>

        <h2>8. Τροποποίηση</h2>
        <p>
          Τροποποίηση της παρούσας γνωστοποιείται 30 ημέρες νωρίτερα μέσω email και μέσω της πλατφόρμας.
        </p>

        <div className="flex gap-6 text-sm text-slate-500 pt-4 border-t border-slate-200 not-prose">
          <Link href="/security" className="hover:text-indigo-600">Ασφάλεια</Link>
          <Link href="/privacy" className="hover:text-indigo-600">Απόρρητο</Link>
          <Link href="/terms" className="hover:text-indigo-600">Όροι Χρήσης</Link>
          <Link href="/login" className="hover:text-indigo-600">Σύνδεση</Link>
        </div>
      </main>
    </div>
  )
}
