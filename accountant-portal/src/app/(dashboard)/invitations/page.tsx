'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Mail, Plus, Trash2, Copy, Check, Clock } from 'lucide-react'

const base = typeof window !== 'undefined' ? window.location.origin : ''

function statusVariant(s: string, exp: string) {
  if (s === 'ACCEPTED') return 'success'
  if (new Date(exp) < new Date()) return 'secondary'
  return 'info'
}
function statusLabel(s: string, exp: string) {
  if (s === 'ACCEPTED') return 'Αποδεκτή'
  if (new Date(exp) < new Date()) return 'Έληξε'
  return 'Εκκρεμής'
}

export default function InvitationsPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [invitations, setInvitations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    if (session && session.user.role !== 'ADMIN') router.replace('/')
  }, [session, router])

  function load() {
    fetch('/api/invitations').then(r => r.json()).then(d => { setInvitations(Array.isArray(d) ? d : []); setLoading(false) })
  }
  useEffect(() => { load() }, [])

  async function send() {
    if (!email) return
    setSending(true)
    const res = await fetch('/api/invitations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, note }),
    })
    setSending(false)
    if (res.ok) { setEmail(''); setNote(''); load() }
    else { const e = await res.json(); alert(e.error || 'Σφάλμα') }
  }

  async function del(id: string) {
    if (!confirm('Διαγραφή πρόσκλησης;')) return
    await fetch(`/api/invitations/${id}`, { method: 'DELETE' })
    setInvitations(prev => prev.filter(i => i.id !== id))
  }

  function copyLink(token: string) {
    const link = `${base}/register?token=${token}`
    navigator.clipboard.writeText(link)
    setCopied(token)
    setTimeout(() => setCopied(null), 2000)
  }

  const pending   = invitations.filter(i => i.status === 'PENDING' && new Date(i.expiresAt) >= new Date()).length
  const accepted  = invitations.filter(i => i.status === 'ACCEPTED').length

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Προσκλήσεις</h1>
        <p className="text-gray-500 mt-1">Στείλτε πρόσκληση σε νέους λογιστές να εγγραφούν στο portal</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Σύνολο', value: invitations.length, color: 'text-gray-800' },
          { label: 'Εκκρεμείς', value: pending, color: 'text-indigo-600' },
          { label: 'Αποδεκτές', value: accepted, color: 'text-green-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4 text-center shadow-sm">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Send form */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
        <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
          <Mail size={18} className="text-indigo-500" />
          Νέα Πρόσκληση
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Email νέου λογιστή *</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              placeholder="email@example.com"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Προσωπικό μήνυμα (προαιρετικό)</label>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="π.χ. Μίλησα μαζί σου στο συνέδριο..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
        <Button loading={sending} onClick={send} disabled={!email}>
          <Plus size={15} className="mr-2" />
          Αποστολή Πρόσκλησης
        </Button>
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">Ιστορικό Προσκλήσεων</h2>
        </div>
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin w-7 h-7 border-4 border-indigo-600 border-t-transparent rounded-full" />
          </div>
        ) : invitations.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Mail size={32} className="mx-auto mb-2 text-gray-200" />
            Δεν έχετε στείλει ακόμα προσκλήσεις
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {invitations.map(inv => {
              const expired = new Date(inv.expiresAt) < new Date() && inv.status === 'PENDING'
              return (
                <div key={inv.id} className={`flex items-center gap-4 px-6 py-4 ${expired ? 'opacity-50' : ''}`}>
                  <div className="w-9 h-9 rounded-full bg-indigo-50 flex items-center justify-center flex-shrink-0">
                    <Mail size={16} className="text-indigo-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm">{inv.email}</p>
                    {inv.note && <p className="text-xs text-gray-400 italic mt-0.5">"{inv.note}"</p>}
                    <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                      <Clock size={10} />
                      {new Date(inv.createdAt).toLocaleDateString('el-GR')}
                      {' · '}
                      Λήγει: {new Date(inv.expiresAt).toLocaleDateString('el-GR')}
                    </p>
                  </div>
                  <Badge variant={statusVariant(inv.status, inv.expiresAt)}>
                    {statusLabel(inv.status, inv.expiresAt)}
                  </Badge>
                  {inv.status === 'PENDING' && !expired && (
                    <button
                      onClick={() => copyLink(inv.token)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-indigo-600 transition-colors"
                      title="Αντιγραφή συνδέσμου"
                    >
                      {copied === inv.token ? <Check size={15} className="text-green-500" /> : <Copy size={15} />}
                    </button>
                  )}
                  <button
                    onClick={() => del(inv.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
