import Link from 'next/link'
import { Shield } from 'lucide-react'

export const metadata = {
  title: 'Όροι Χρήσης — I-MENTOR Portal',
}

export default function TermsPage() {
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
        <h1 className="text-3xl font-bold text-slate-900 mb-1">Όροι Χρήσης</h1>
        <p className="text-slate-500 text-sm mb-10">Τελευταία ενημέρωση: Ιούνιος 2026</p>

        <div className="space-y-8 text-slate-700 text-sm leading-relaxed">

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">1. Αντικείμενο</h2>
            <p>
              Οι παρόντες Όροι Χρήσης διέπουν τη χρήση του <strong>I-MENTOR Portal</strong> («Υπηρεσία») που παρέχεται από την <strong>I-MENTOR IKE</strong>, ΑΦΜ 802100033, Ροδιά, Ηράκλειο Κρήτης 71500 («I-MENTOR»), σε εγγεγραμμένα λογιστικά γραφεία («Χρήστες»).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">2. Παροχή Υπηρεσίας</h2>
            <p className="mb-2">Το I-MENTOR Portal παρέχει στα λογιστικά γραφεία:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Διαχείριση βάσης δεδομένων επιχειρήσεων-πελατών</li>
              <li>Αυτόματη αντιστοίχιση επιχειρήσεων με επιδοτούμενα προγράμματα</li>
              <li>Αποστολή καμπανιών ενημέρωσης μέσω email και Viber</li>
              <li>Αναζήτηση στοιχείων επιχειρήσεων μέσω ΑΑΔΕ/GSIS</li>
              <li>Εξαγωγή δεδομένων σε μορφή Excel</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">3. Υποχρεώσεις Χρήστη</h2>
            <p className="mb-2">Ο Χρήστης οφείλει:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Να παρέχει ακριβή και ενημερωμένα στοιχεία κατά την εγγραφή</li>
              <li>Να διασφαλίζει ότι έχει νόμιμη βάση (συγκατάθεση ή έννομο συμφέρον) για την αποστολή επικοινωνιών στους πελάτες του</li>
              <li>Να μη χρησιμοποιεί την υπηρεσία για αποστολή spam ή παραπλανητικού περιεχομένου</li>
              <li>Να διατηρεί εμπιστευτικούς τους κωδικούς πρόσβασης</li>
              <li>Να συμμορφώνεται με τον ΓΚΠΔ ως προς τα δεδομένα των πελατών του</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">4. Κοινή Επεξεργασία Δεδομένων</h2>
            <p>
              Το I-MENTOR Portal λειτουργεί με καθεστώς <strong>Κοινής Επεξεργασίας</strong> (Άρθρο 26 ΓΚΠΔ). Το I-MENTOR, ως πάροχος της πλατφόρμας, έχει πρόσβαση στα δεδομένα επιχειρήσεων για λόγους λειτουργίας, τεχνικής υποστήριξης και βελτίωσης της υπηρεσίας. Η αναλυτική κατανομή ευθυνών ορίζεται στη <Link href="/dpa" className="text-indigo-600 hover:underline">Συμφωνία Κοινής Επεξεργασίας</Link>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">5. Πνευματική Ιδιοκτησία</h2>
            <p>
              Το λογισμικό, ο σχεδιασμός και το περιεχόμενο της πλατφόρμας ανήκουν στο I-MENTOR. Τα δεδομένα επιχειρήσεων που εισάγει ο Χρήστης παραμένουν ιδιοκτησία του.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">6. Διαθεσιμότητα</h2>
            <p>
              Το I-MENTOR καταβάλλει εύλογη προσπάθεια για αδιάλειπτη λειτουργία. Δεν εγγυάται αδιάκοπη διαθεσιμότητα λόγω συντήρησης, αναβαθμίσεων ή λόγων ανωτέρας βίας.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">7. Αποποίηση Ευθύνης</h2>
            <p className="mb-3">
              Η Υπηρεσία παρέχεται «ως έχει». Το I-MENTOR <strong>δεν φέρει καμία ευθύνη</strong> για:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Λανθασμένα ή ανακριβή στοιχεία επιχειρήσεων που εισήγαγε ο Χρήστης</li>
              <li>Αποστολές επικοινωνιών χωρίς νόμιμη βάση ή χωρίς συγκατάθεση</li>
              <li>Τυχόν σφάλματα ή αναλήθειες στα στοιχεία προγραμμάτων/επιδοτήσεων</li>
              <li>Λανθασμένες ή χαμένες επικοινωνίες προς πελάτες</li>
              <li>Αποφάσεις που βασίστηκαν σε αντιστοιχίσεις ή πληροφορίες της πλατφόρμας</li>
              <li>Τεχνικές αστοχίες τρίτων (ΑΑΔΕ API, Chatwoot, Railway, SMTP)</li>
              <li>Ζημίες άμεσες ή έμμεσες που προκύπτουν από τη χρήση ή αδυναμία χρήσης της Υπηρεσίας</li>
            </ul>
            <p className="mt-3">
              Ο Χρήστης χρησιμοποιεί την Υπηρεσία με αποκλειστική δική του ευθύνη και οφείλει να επαληθεύει κάθε πληροφορία πριν τη χρησιμοποιήσει για επαγγελματικές αποφάσεις.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">8. Αναστολή & Τερματισμός Λογαριασμού</h2>
            <p className="mb-3">
              Ο Χρήστης μπορεί να τερματίσει τη χρήση οποτεδήποτε. Το I-MENTOR διατηρεί το δικαίωμα να <strong>αναστείλει ή διαγράψει άμεσα</strong> λογαριασμούς που:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Παραβιάζουν τους παρόντες Όρους</li>
              <li>Δεν συμμορφώνονται με τον ΓΚΠΔ ή την κείμενη νομοθεσία</li>
              <li>Χρησιμοποιούν την υπηρεσία για αποστολή spam ή παραπλανητικών επικοινωνιών</li>
              <li>Παραμένουν ανενεργοί για διάστημα άνω των 12 μηνών</li>
              <li>Έχουν ληξιπρόθεσμες οικονομικές υποχρεώσεις (εφόσον ισχύει)</li>
            </ul>
            <p className="mt-3">
              Μετά τον τερματισμό, ο Χρήστης μπορεί να ζητήσει διαγραφή δεδομένων (βλ. <Link href="/privacy" className="text-indigo-600 hover:underline">Πολιτική Απορρήτου</Link>).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">9. Εφαρμοστέο Δίκαιο</h2>
            <p>
              Εφαρμόζεται ελληνικό δίκαιο και δίκαιο ΕΕ. Αρμόδια δικαστήρια: Ηρακλείου Κρήτης.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">10. Τροποποίηση Όρων</h2>
            <p>
              Το I-MENTOR δύναται να τροποποιεί τους Όρους με προειδοποίηση 30 ημερών μέσω email. Η συνέχιση χρήσης μετά την προθεσμία σημαίνει αποδοχή.
            </p>
          </section>

        </div>

        <div className="flex gap-6 text-sm text-slate-500 pt-8 mt-8 border-t border-slate-200">
          <Link href="/security" className="hover:text-indigo-600">Ασφάλεια</Link>
          <Link href="/privacy" className="hover:text-indigo-600">Απόρρητο</Link>
          <Link href="/dpa" className="hover:text-indigo-600">Συμφωνία Κοινής Επεξεργασίας</Link>
          <Link href="/login" className="hover:text-indigo-600">Σύνδεση</Link>
        </div>
      </main>
    </div>
  )
}
