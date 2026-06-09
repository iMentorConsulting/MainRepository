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

      <main className="max-w-4xl mx-auto px-6 py-12 prose prose-slate max-w-none">
        <h1>Όροι Χρήσης</h1>
        <p className="text-slate-500 text-sm">Τελευταία ενημέρωση: Ιούνιος 2026</p>

        <h2>1. Αντικείμενο</h2>
        <p>
          Οι παρόντες Όροι Χρήσης διέπουν τη χρήση του <strong>I-MENTOR Portal</strong> («Υπηρεσία») που παρέχεται από την <strong>I-MENTOR Consulting</strong> («I-MENTOR»), σε εγγεγραμμένα λογιστικά γραφεία («Χρήστες/Λογιστές»).
        </p>

        <h2>2. Παροχή Υπηρεσίας</h2>
        <p>Το I-MENTOR Portal παρέχει στα λογιστικά γραφεία:</p>
        <ul>
          <li>Διαχείριση βάσης δεδομένων επιχειρήσεων-πελατών</li>
          <li>Αυτόματη αντιστοίχιση επιχειρήσεων με επιδοτούμενα προγράμματα</li>
          <li>Αποστολή καμπανιών ενημέρωσης μέσω email και Viber</li>
          <li>Αναζήτηση στοιχείων επιχειρήσεων μέσω ΑΑΔΕ/GSIS</li>
          <li>Εξαγωγή δεδομένων σε μορφή Excel</li>
        </ul>

        <h2>3. Υποχρεώσεις Χρήστη</h2>
        <p>Ο Χρήστης οφείλει:</p>
        <ul>
          <li>Να παρέχει ακριβή και ενημερωμένα στοιχεία κατά την εγγραφή</li>
          <li>Να διασφαλίζει ότι έχει νόμιμη βάση (συγκατάθεση ή έννομο συμφέρον) για την αποστολή επικοινωνιών στους πελάτες του</li>
          <li>Να μη χρησιμοποιεί την υπηρεσία για αποστολή spam ή παραπλανητικού περιεχομένου</li>
          <li>Να διατηρεί εμπιστευτικούς τους κωδικούς πρόσβασης</li>
          <li>Να συμμορφώνεται με τον ΓΚΠΔ ως προς τα δεδομένα των πελατών του</li>
        </ul>

        <h2>4. Κοινή Επεξεργασία Δεδομένων</h2>
        <p>
          Το I-MENTOR Portal λειτουργεί με καθεστώς <strong>Κοινής Επεξεργασίας</strong> (Άρθρο 26 ΓΚΠΔ). Το I-MENTOR, ως πάροχος της πλατφόρμας, έχει πρόσβαση στα δεδομένα επιχειρήσεων για λόγους λειτουργίας, τεχνικής υποστήριξης και βελτίωσης της υπηρεσίας. Η αναλυτική κατανομή ευθυνών ορίζεται στη <Link href="/dpa">Συμφωνία Κοινής Επεξεργασίας</Link>.
        </p>

        <h2>5. Πνευματική Ιδιοκτησία</h2>
        <p>
          Το λογισμικό, ο σχεδιασμός και το περιεχόμενο της πλατφόρμας ανήκουν στο I-MENTOR. Τα δεδομένα επιχειρήσεων που εισάγει ο Λογιστής παραμένουν ιδιοκτησία του Λογιστή.
        </p>

        <h2>6. Διαθεσιμότητα & SLA</h2>
        <p>
          Το I-MENTOR καταβάλλει εύλογη προσπάθεια για διαθεσιμότητα 99% (μηνιαίο μέσο). Δεν εγγυόμαστε αδιάκοπη λειτουργία λόγω συντήρησης ή force majeure.
        </p>

        <h2>7. Περιορισμός Ευθύνης</h2>
        <p>
          Το I-MENTOR δεν φέρει ευθύνη για ζημίες που προκύπτουν από: (α) λανθασμένα δεδομένα που εισήγαγε ο Χρήστης, (β) αποστολές χωρίς νόμιμη βάση, (γ) τεχνικές αστοχίες τρίτων (ΑΑΔΕ API, Chatwoot, Railway). Η συνολική ευθύνη του I-MENTOR δεν υπερβαίνει το ύψος των τελευταίων 3 μηνών αμοιβής.
        </p>

        <h2>8. Τερματισμός</h2>
        <p>
          Ο Χρήστης μπορεί να τερματίσει τη χρήση οποτεδήποτε. Το I-MENTOR μπορεί να αναστείλει λογαριασμούς που παραβιάζουν τους παρόντες Όρους. Μετά τον τερματισμό, ο Χρήστης μπορεί να ζητήσει διαγραφή δεδομένων (βλ. <Link href="/privacy">Πολιτική Απορρήτου</Link>).
        </p>

        <h2>9. Εφαρμοστέο Δίκαιο</h2>
        <p>
          Εφαρμόζεται ελληνικό δίκαιο και δίκαιο ΕΕ. Αρμόδια δικαστήρια: Ηρακλείου Κρήτης.
        </p>

        <h2>10. Τροποποίηση Όρων</h2>
        <p>
          Το I-MENTOR δύναται να τροποποιεί τους Όρους με προειδοποίηση 30 ημερών μέσω email. Η συνέχιση χρήσης μετά την προθεσμία σημαίνει αποδοχή.
        </p>

        <div className="flex gap-6 text-sm text-slate-500 pt-4 border-t border-slate-200 not-prose">
          <Link href="/security" className="hover:text-indigo-600">Ασφάλεια</Link>
          <Link href="/privacy" className="hover:text-indigo-600">Απόρρητο</Link>
          <Link href="/dpa" className="hover:text-indigo-600">Συμφωνία Κοινής Επεξεργασίας</Link>
          <Link href="/login" className="hover:text-indigo-600">Σύνδεση</Link>
        </div>
      </main>
    </div>
  )
}
