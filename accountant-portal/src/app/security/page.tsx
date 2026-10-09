import Link from 'next/link'
import { Shield, Lock, Server, Eye, Trash2, FileText, CheckCircle } from 'lucide-react'

export const metadata = {
  title: 'Ασφάλεια & Προστασία Δεδομένων — I-MENTOR Portal',
}

export default function SecurityPage() {
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
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-slate-900 mb-3">Ασφάλεια & Προστασία Δεδομένων</h1>
          <p className="text-slate-600 text-lg leading-relaxed">
            Δεσμευόμαστε για διαφάνεια σχετικά με το πώς προστατεύουμε τα δεδομένα σας και των πελατών σας. Αυτή η σελίδα περιγράφει συγκεκριμένα τεχνικά και οργανωτικά μέτρα που εφαρμόζουμε.
          </p>
        </div>

        <div className="space-y-8">

          <Section icon={Lock} title="Κρυπτογράφηση & Μεταφορά Δεδομένων">
            <ul className="space-y-2 text-sm text-slate-600">
              <Item>Όλη η επικοινωνία μεταξύ browser και server γίνεται μέσω <strong>TLS 1.3</strong> (HTTPS). Δεν υπάρχει μη-κρυπτογραφημένη πρόσβαση.</Item>
              <Item>Οι κωδικοί ΑΑΔΕ/TAXISnet αποθηκεύονται <strong>κρυπτογραφημένοι</strong> με AES-256 στη βάση δεδομένων — δεν είναι αναγνώσιμοι ακόμα και σε περίπτωση διαρροής της βάσης.</Item>
              <Item>Οι κωδικοί πρόσβασης χρηστών αποθηκεύονται ως <strong>bcrypt hash</strong> (δεν αποθηκεύεται ο κωδικός σε απλό κείμενο).</Item>
            </ul>
          </Section>

          <Section icon={Server} title="Υποδομή & Φιλοξενία">
            <ul className="space-y-2 text-sm text-slate-600">
              <Item>Η εφαρμογή φιλοξενείται στο <strong>Railway.app</strong> — cloud infrastructure σε data centers της <strong>Ευρωπαϊκής Ένωσης</strong>.</Item>
              <Item>Η βάση δεδομένων PostgreSQL βρίσκεται σε απομονωμένο, μη-δημόσιο δίκτυο και δεν είναι απευθείας προσβάσιμη από το internet.</Item>
              <Item>Αυτόματα backups της βάσης δεδομένων εκτελούνται ημερησίως.</Item>
            </ul>
          </Section>

          <Section icon={Eye} title="Απομόνωση Δεδομένων Λογιστικών Γραφείων">
            <ul className="space-y-2 text-sm text-slate-600">
              <Item>Κάθε λογιστικό γραφείο <strong>βλέπει μόνο τις δικές του επιχειρήσεις</strong> — δεν υπάρχει πρόσβαση σε δεδομένα άλλων γραφείων.</Item>
              <Item>Όλα τα API endpoints ελέγχουν την ταυτότητα και τον ρόλο του χρήστη πριν επιστρέψουν δεδομένα.</Item>
              <Item>Η <strong>I-MENTOR Consulting</strong>, ως Κοινός Υπεύθυνος Επεξεργασίας (Άρθρο 26 ΓΚΠΔ), έχει πρόσβαση στα δεδομένα όλων των γραφείων για τους σκοπούς που ορίζει η Συμφωνία Κοινής Επεξεργασίας — κυρίως για την παροχή της υπηρεσίας και τη βελτίωσή της.</Item>
            </ul>
          </Section>

          <Section icon={FileText} title="Αρχείο Καταγραφής (Audit Log)">
            <ul className="space-y-2 text-sm text-slate-600">
              <Item>Κάθε σημαντική ενέργεια (δημιουργία/τροποποίηση/διαγραφή επιχείρησης, αποστολή καμπάνιας κ.λπ.) καταγράφεται με timestamp και αναγνωριστικό χρήστη.</Item>
              <Item>Το audit log δεν μπορεί να τροποποιηθεί από κανέναν χρήστη της εφαρμογής.</Item>
            </ul>
          </Section>

          <Section icon={Trash2} title="Διαγραφή Δεδομένων (Δικαίωμα στη Λήθη)">
            <ul className="space-y-2 text-sm text-slate-600">
              <Item>Κάθε λογιστής μπορεί να διαγράψει μεμονωμένες επιχειρήσεις απευθείας από το Portal.</Item>
              <Item>Για πλήρη διαγραφή λογαριασμού και όλων των δεδομένων, υποβάλλεται αίτημα μέσω της σελίδας Ρυθμίσεων. Εκτελείται εντός <strong>30 ημερών</strong> (ΓΚΠΔ Άρθρο 17).</Item>
              <Item>Τα δεδομένα που έχουν σταλεί σε τρίτους (π.χ. email, Viber μέσω Chatwoot) δεν μπορούν να ανακληθούν τεχνικά από εμάς.</Item>
            </ul>
          </Section>

          <Section icon={Shield} title="Τι κάνουμε ΚΑΙ τι ΔΕΝ κάνουμε με τα δεδομένα σας">
            <div className="grid md:grid-cols-2 gap-6 text-sm">
              <div>
                <p className="font-semibold text-green-700 mb-2">✓ Κάνουμε:</p>
                <ul className="space-y-1 text-slate-600">
                  <li>— Αποθηκεύουμε δεδομένα για λογαριασμό του γραφείου σας</li>
                  <li>— Στέλνουμε καμπάνιες όταν εσείς το ζητάτε</li>
                  <li>— Αναζητούμε ΑΦΜ στο ΑΑΔΕ για εμπλουτισμό στοιχείων</li>
                  <li>— Παρέχουμε αναλυτικά για τις καμπάνιες σας</li>
                  <li>— Αποθηκεύουμε audit log για λόγους ασφαλείας</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-red-700 mb-2">✗ ΔΕΝ κάνουμε:</p>
                <ul className="space-y-1 text-slate-600">
                  <li>— Δεν πουλάμε δεδομένα σε τρίτους</li>
                  <li>— Δεν χρησιμοποιούμε δεδομένα για διαφημιστικούς σκοπούς</li>
                  <li>— Δεν επεξεργαζόμαστε δεδομένα εκτός του σκοπού της υπηρεσίας</li>
                  <li>— Δεν μοιραζόμαστε δεδομένα με ανταγωνιστές</li>
                  <li>— Δεν χρησιμοποιούμε τα δεδομένα για AI training χωρίς συγκατάθεση</li>
                </ul>
              </div>
            </div>
          </Section>

          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-6 text-sm text-slate-700">
            <p className="font-semibold text-indigo-900 mb-2">Επικοινωνία για θέματα ασφάλειας και GDPR</p>
            <p>Για αναφορά ευπαθειών ασφαλείας ή για θέματα προστασίας δεδομένων επικοινωνήστε: <a href="mailto:info@i-mentor.gr" className="text-indigo-600 hover:underline">info@i-mentor.gr</a></p>
          </div>

          <div className="flex gap-6 text-sm text-slate-500 pt-4 border-t border-slate-200">
            <Link href="/privacy" className="hover:text-indigo-600">Πολιτική Απορρήτου</Link>
            <Link href="/terms" className="hover:text-indigo-600">Όροι Χρήσης</Link>
            <Link href="/dpa" className="hover:text-indigo-600">Συμφωνία Κοινής Επεξεργασίας</Link>
            <Link href="/login" className="hover:text-indigo-600">Σύνδεση</Link>
          </div>
        </div>
      </main>
    </div>
  )
}

function Section({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2">
        <Icon size={18} className="text-indigo-600" />
        {title}
      </h2>
      {children}
    </div>
  )
}

function Item({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <CheckCircle size={14} className="text-green-500 mt-0.5 flex-shrink-0" />
      <span>{children}</span>
    </li>
  )
}
