'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/table'
import { formatDate } from '@/lib/utils'
import { Plus, Send, Copy, X, Banknote, Clock, CheckCircle, AlertCircle, ShieldCheck } from 'lucide-react'

const statusLabel: Record<string, string> = {
  PENDING: 'Εκκρεμεί',
  SENT: 'Εστάλη',
  PAID: 'Πληρώθηκε',
  EXPIRED: 'Έληξε',
  CANCELLED: 'Ακυρώθηκε',
}

const statusVariant: Record<string, any> = {
  PENDING: 'secondary',
  SENT: 'info',
  PAID: 'success',
  EXPIRED: 'danger',
  CANCELLED: 'secondary',
}

function formatEur(cents: number) {
  return (cents / 100).toLocaleString('el-GR', { style: 'currency', currency: 'EUR' })
}

export default function PaymentsPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [requests, setRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [sending, setSending] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // Confirm modal state
  const [confirmModal, setConfirmModal] = useState<{ id: string; irisReference: string } | null>(null)
  const [bankReference, setBankReference] = useState('')
  const [confirming, setConfirming] = useState(false)

  const isAdmin = session?.user?.role === 'ADMIN'

  useEffect(() => {
    if (session && !isAdmin) router.replace('/')
  }, [session, isAdmin, router])

  useEffect(() => {
    loadRequests()
  }, [statusFilter])

  async function loadRequests() {
    setLoading(true)
    const params = new URLSearchParams()
    if (statusFilter) params.set('status', statusFilter)
    const res = await fetch(`/api/payments/requests?${params}`)
    const data = await res.json()
    setRequests(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  async function sendLink(id: string) {
    setSending(id)
    const res = await fetch(`/api/payments/requests/${id}/send`, { method: 'POST' })
    if (res.ok) {
      showToast('Ο σύνδεσμος IRIS εστάλη με επιτυχία!')
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'SENT' } : r))
    } else {
      const err = await res.json()
      showToast(err.error || 'Σφάλμα αποστολής', 'error')
    }
    setSending(null)
  }

  async function copyLink(link: string) {
    await navigator.clipboard.writeText(link)
    showToast('Ο σύνδεσμος IRIS αντιγράφηκε!')
  }

  async function cancelRequest(id: string) {
    if (!confirm('Είστε σίγουροι ότι θέλετε να ακυρώσετε αυτό το αίτημα;')) return
    setCancelling(id)
    const res = await fetch(`/api/payments/requests/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'CANCELLED' }),
    })
    if (res.ok) {
      showToast('Το αίτημα ακυρώθηκε.')
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'CANCELLED' } : r))
    } else {
      showToast('Σφάλμα ακύρωσης', 'error')
    }
    setCancelling(null)
  }

  async function confirmPayment() {
    if (!confirmModal) return
    setConfirming(true)
    const res = await fetch(`/api/payments/requests/${confirmModal.id}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bankReference }),
    })
    if (res.ok) {
      showToast('Η πληρωμή επιβεβαιώθηκε!')
      setRequests(prev => prev.map(r => r.id === confirmModal.id ? { ...r, status: 'PAID', paidAt: new Date().toISOString() } : r))
      setConfirmModal(null)
      setBankReference('')
    } else {
      showToast('Σφάλμα επιβεβαίωσης', 'error')
    }
    setConfirming(false)
  }

  // Stats
  const total = requests.length
  const pending = requests.filter(r => r.status === 'PENDING' || r.status === 'SENT').length
  const paid = requests.filter(r => r.status === 'PAID').length
  const revenue = requests.filter(r => r.status === 'PAID').reduce((sum, r) => sum + r.amount, 0)

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-lg shadow-lg text-white text-sm font-medium transition-all ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      {/* Confirm Payment Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Επιβεβαίωση Πληρωμής</h3>
            <p className="text-sm text-gray-600">
              Επιβεβαιώστε ότι λάβατε την πληρωμή IRIS με αριθμό αναφοράς:{' '}
              <span className="font-mono font-bold text-blue-800">{confirmModal.irisReference}</span>
            </p>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">
                Αριθμός Συναλλαγής Τράπεζας <span className="font-normal text-gray-400">(προαιρετικό)</span>
              </label>
              <input
                type="text"
                value={bankReference}
                onChange={e => setBankReference(e.target.value)}
                placeholder="π.χ. TXN20240601123456"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button onClick={confirmPayment} loading={confirming}>
                Επιβεβαίωση Πληρωμής
              </Button>
              <Button variant="outline" onClick={() => { setConfirmModal(null); setBankReference('') }}>
                Ακύρωση
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Πληρωμές</h1>
          <p className="text-gray-500 mt-1">Διαχείριση αιτημάτων πληρωμής μέσω IRIS</p>
        </div>
        <Link href="/payments/new">
          <Button>
            <Plus size={16} className="mr-2" />
            Νέο Αίτημα
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
              <Banknote size={20} className="text-blue-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{total}</div>
              <div className="text-xs text-gray-500">Σύνολο Αιτημάτων</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-50 rounded-lg flex items-center justify-center">
              <Clock size={20} className="text-yellow-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{pending}</div>
              <div className="text-xs text-gray-500">Εκκρεμείς</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
              <CheckCircle size={20} className="text-green-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{paid}</div>
              <div className="text-xs text-gray-500">Ολοκληρωμένες</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center">
              <AlertCircle size={20} className="text-emerald-600" />
            </div>
            <div>
              <div className="text-xl font-bold text-gray-900">{formatEur(revenue)}</div>
              <div className="text-xs text-gray-500">Συνολικά Έσοδα</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Όλες οι καταστάσεις</option>
          {Object.entries(statusLabel).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        {isAdmin && (
          <Link href="/payments/services" className="ml-auto">
            <Button variant="outline" size="sm">Διαχείριση Υπηρεσιών</Button>
          </Link>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin w-8 h-8 border-4 border-blue-800 border-t-transparent rounded-full" />
          </div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <Th>Επιχείρηση</Th>
                <Th>Υπηρεσία</Th>
                {isAdmin && <Th>Λογιστής</Th>}
                <Th>Ποσό</Th>
                <Th>Αριθμός IRIS</Th>
                <Th>Κατάσταση</Th>
                <Th>Δημιουργία</Th>
                <Th>Πληρωμή</Th>
                <Th>Ενέργειες</Th>
              </TableRow>
            </TableHead>
            <TableBody>
              {requests.length === 0 ? (
                <TableRow>
                  <Td colSpan={isAdmin ? 9 : 8} className="text-center text-gray-400 py-8">
                    Δεν βρέθηκαν αιτήματα πληρωμής
                  </Td>
                </TableRow>
              ) : (
                requests.map(r => (
                  <TableRow key={r.id}>
                    <Td>
                      <div className="font-medium text-sm">{r.business?.onomasia || r.business?.afm}</div>
                      <div className="text-xs text-gray-400">{r.business?.afm}</div>
                    </Td>
                    <Td className="text-sm">{r.service?.name}</Td>
                    {isAdmin && <Td className="text-sm text-gray-500">{r.accountant?.officeName}</Td>}
                    <Td className="text-sm font-semibold text-gray-900">{formatEur(r.amount)}</Td>
                    <Td>
                      {r.irisReference
                        ? <span className="font-mono text-xs text-blue-800">{r.irisReference}</span>
                        : <span className="text-gray-400 text-xs">—</span>
                      }
                    </Td>
                    <Td>
                      <Badge variant={statusVariant[r.status]}>{statusLabel[r.status]}</Badge>
                    </Td>
                    <Td className="text-sm text-gray-500">{formatDate(r.createdAt)}</Td>
                    <Td className="text-sm text-gray-500">{r.paidAt ? formatDate(r.paidAt) : '-'}</Td>
                    <Td>
                      <div className="flex gap-1">
                        {/* Send email */}
                        {r.status !== 'PAID' && r.status !== 'EXPIRED' && r.status !== 'CANCELLED' && r.business?.email && (
                          <button
                            onClick={() => sendLink(r.id)}
                            disabled={sending === r.id}
                            title="Αποστολή email IRIS"
                            className="p-1.5 rounded hover:bg-blue-50 text-blue-600 disabled:opacity-50"
                          >
                            <Send size={14} />
                          </button>
                        )}
                        {/* Copy IRIS link */}
                        {r.irisLink && (
                          <button
                            onClick={() => copyLink(r.irisLink)}
                            title="Αντιγραφή συνδέσμου IRIS"
                            className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                          >
                            <Copy size={14} />
                          </button>
                        )}
                        {/* Admin: confirm payment */}
                        {isAdmin && (r.status === 'PENDING' || r.status === 'SENT') && (
                          <button
                            onClick={() => setConfirmModal({ id: r.id, irisReference: r.irisReference || '' })}
                            title="Επιβεβαίωση Πληρωμής"
                            className="p-1.5 rounded hover:bg-green-50 text-green-600"
                          >
                            <ShieldCheck size={14} />
                          </button>
                        )}
                        {/* Cancel */}
                        {r.status !== 'PAID' && r.status !== 'CANCELLED' && r.status !== 'EXPIRED' && (
                          <button
                            onClick={() => cancelRequest(r.id)}
                            disabled={cancelling === r.id}
                            title="Ακύρωση"
                            className="p-1.5 rounded hover:bg-red-50 text-red-500 disabled:opacity-50"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    </Td>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
