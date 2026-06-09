'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { MessageCircle, Scale, LayoutDashboard, Bell, Smartphone, FileCheck, ArrowRight, CheckCircle2, Sparkles } from 'lucide-react'

function ServiceCard({ icon, title, subtitle, features, badge, accentColor, onContact }: {
  icon: React.ReactNode
  title: string
  subtitle: string
  features: string[]
  badge?: string
  accentColor: string
  onContact: () => void
}) {
  return (
    <div className={`bg-white rounded-2xl border-2 ${accentColor} shadow-sm overflow-hidden`}>
      <div className={`px-6 py-5 border-b ${accentColor.replace('border-', 'border-b-').replace('border-2', '')}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {icon}
            <div>
              <h3 className="text-lg font-bold text-gray-900">{title}</h3>
              <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
            </div>
          </div>
          {badge && (
            <span className="flex-shrink-0 text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
              {badge}
            </span>
          )}
        </div>
      </div>
      <div className="px-6 py-5 space-y-4">
        <ul className="space-y-2">
          {features.map((f, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
              <CheckCircle2 size={15} className="text-green-500 flex-shrink-0 mt-0.5" />
              {f}
            </li>
          ))}
        </ul>
        <button
          onClick={onContact}
          className="mt-2 w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
        >
          <MessageCircle size={15} />
          Επικοινωνία για πελάτη μου
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  )
}

export default function ServicesPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [sending, setSending] = useState<string | null>(null)

  useEffect(() => {
    if (session && session.user.role !== 'ADMIN') router.replace('/')
  }, [session, router])

  async function openChat(subject: string, body: string) {
    setSending(subject)
    const res = await fetch('/api/chat/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, body }),
    })
    setSending(null)
    if (res.ok) {
      const conv = await res.json()
      router.push(`/chat/${conv.id}`)
    }
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={20} className="text-indigo-500" />
          <span className="text-xs font-bold text-indigo-500 uppercase tracking-wide">Υπηρεσίες I-MENTOR</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Υπηρεσίες & Εργαλεία</h1>
        <p className="text-gray-500 mt-1">
          Πέρα από τα χρηματοδοτικά προγράμματα, η I-MENTOR παρέχει εξειδικευμένες υπηρεσίες για τους πελάτες σας.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Extrajudicial */}
        <ServiceCard
          accentColor="border-purple-200"
          icon={
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Scale size={22} className="text-purple-600" />
            </div>
          }
          title="Εξωδικαστικός Μηχανισμός"
          subtitle="Ρύθμιση οφειλών & αξιολόγηση αποτελέσματος"
          badge="Μοναδικό στην Ελλάδα"
          features={[
            'Ανάλυση βιωσιμότητας & εκτίμηση αποτελέσματος ρύθμισης',
            'Σύγκριση σεναρίων: εξωδικαστικός vs πτώχευση',
            'Υπολογισμός ανώτατης ρύθμισης ανά πιστωτή',
            'Πλήρης ανάλυση σε PDF — έτοιμη για τράπεζες & Δ.Ε.',
            'Συνεργασία με το δικό σας λογιστικό γραφείο',
          ]}
          onContact={() => openChat(
            'Αίτημα για Εξωδικαστικό Μηχανισμό',
            'Θα ήθελα να συζητήσουμε για πελάτη μου που ενδιαφέρεται για εξωδικαστικό μηχανισμό ρύθμισης οφειλών.'
          )}
        />

        {/* Case Management */}
        <ServiceCard
          accentColor="border-indigo-200"
          icon={
            <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <LayoutDashboard size={22} className="text-indigo-600" />
            </div>
          }
          title="Case Management System"
          subtitle="Παρακολούθηση προγράμματος από το α ως το ω"
          features={[
            'Προσωπικό portal για κάθε πελάτη — online πρόσβαση σε κάθε στάδιο',
            'Ειδοποιήσεις Viber σε αλλαγή σταδίου & εκκρεμότητες',
            'Πλήρης πρόσβαση από κινητό (mobile-first)',
            'Αυτόματα reminders για υποβολή δικαιολογητικών',
            'Ιστορικό αλληλογραφίας & εγγράφων ανά περίπτωση',
          ]}
          onContact={() => openChat(
            'Αίτημα για Case Management System',
            'Θα ήθελα να μάθω περισσότερα για το σύστημα παρακολούθησης προγραμμάτων για τους πελάτες μου.'
          )}
        />
      </div>

      {/* How it works */}
      <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl border border-indigo-100 p-6">
        <h2 className="text-base font-bold text-gray-900 mb-4">Πώς λειτουργεί η συνεργασία</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { num: '1', title: 'Εντοπίζετε', desc: 'Βρίσκετε έναν πελάτη που χρειάζεται την υπηρεσία', icon: '🔍' },
            { num: '2', title: 'Ενημερώνετε', desc: 'Μας στέλνετε μήνυμα με τα στοιχεία του ενδιαφέροντος', icon: '💬' },
            { num: '3', title: 'Ξεκινάμε', desc: 'Η I-MENTOR αναλαμβάνει — εσείς ενημερώνεστε συνεχώς', icon: '🚀' },
          ].map(s => (
            <div key={s.num} className="flex gap-3">
              <div className="text-2xl flex-shrink-0">{s.icon}</div>
              <div>
                <p className="font-semibold text-gray-800 text-sm">{s.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Viber/Mobile highlights */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: <Bell size={18} className="text-indigo-500" />, label: 'Viber ειδοποιήσεις' },
          { icon: <Smartphone size={18} className="text-green-500" />, label: 'Mobile-first portal' },
          { icon: <FileCheck size={18} className="text-purple-500" />, label: 'Έγγραφα online' },
          { icon: <CheckCircle2 size={18} className="text-amber-500" />, label: 'Ιστορικό σταδίων' },
        ].map((item, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-3 flex items-center gap-2.5 shadow-sm">
            {item.icon}
            <span className="text-xs font-medium text-gray-700">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
