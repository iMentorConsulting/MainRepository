'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/utils'
import {
  ArrowLeft,
  CheckCircle,
  Banknote,
  XCircle,
  RefreshCw,
  ExternalLink,
  Building2,
  User,
  CreditCard,
} from 'lucide-react'

function formatEur(cents: number) {
  return (cents / 100).toLocaleString('el-GR', { style: 'currency', currency: 'EUR' })
}

const statusLabel: Record<string, string> = {
  PENDING: 'Σε Εκκρεμότητα',
  APPROVED: 'Εγκεκριμένη',
  PAID: 'Πληρωμένη',
  CANCELLED: 'Ακυρωμένη',
}

const statusVariant: Record<string, any> = {
  PENDING: 'secondary',
  APPROVED: 'info',
  PAID: 'success',
  CANCELLED: 'danger',
}

const stageLabel: Record<string, string> = {
  APPLICATION: 'Αμοιβή Αίτησης',
  IMPLEMENTATION: 'Αμοιβή Υλοποίησης',
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900">{value ?? '—'}</dd>
    </div>
  )
}

export default function CommissionDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'ADMIN'

  const [commission, setCommission] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => {
    fetch(`/api/commissions/${params.id}`)
      .then(r => r.json())
      .then(data => {
        setCommission(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [params.id])

  async function approve() {
    setProcessing(true)
    const res = await fetch(`/api/commissions/${params.id}/approve`, { method: 'POST' })
    if (res.ok) {
      const data = await res.json()
      setCommission(data)
      showToast('Η προμήθεια εγκρίθηκε!')
    } else {
      showToast('Σφάλμα έγκρισης', 'error')
    }
    setProcessing(false)
  }

  async function pay() {
    setProcessing(true)
    const res = await fetch(`/api/commissions/${params.id}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    if (res.ok) {
      const data = await res.json()
      setCommission(data)
      showToast('Η προμήθεια σημειώθηκε ως πληρωμένη!')
    } else {
      showToast('Σφάλμα πληρωμής', 'error')
    }
    setProcessing(false)
  }

  async function cancel() {
    if (!confirm('Ακύρωση αυτής της προμήθειας;')) return
    setProcessing(true)
    const res = await fetch(`/api/commissions/${params.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'CANCELLED' }),
    })
    if (res.ok) {
      const data = await res.json()
      setCommission(data)
      showToast('Η προμήθεια ακυρώθηκε.')
    } else {
      showToast('Σφάλμα ακύρωσης', 'error')
    }
    setProcessing(false)
  }

  async function syncInvoice() {
    setSyncing(true)
    const res = await fetch(`/api/commissions/${params.id}/sync-invoice`, { method: 'POST' })
    if (res.ok) {
      showToast('Τιμολόγιο δημιουργήθηκε!')
      // Refresh commission data
      const refreshed = await fetch(`/api/commissions/${params.id}`).then(r => r.json())
      setCommission(refreshed)
    } else {
      const data = await res.json()
      showToast(data.error || 'Σφάλμα συγχρονισμού', 'error')
    }
    setSyncing(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-blue-800 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!commission || commission.error) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">Η προμήθεια δεν βρέθηκε.</p>
        <Link href="/commissions" className="text-blue-600 hover:underline text-sm mt-2 inline-block">
          Επιστροφή
        </Link>
      </div>
    )
  }

  // Build calculation breakdown text
  let breakdown = ''
  if (commission.commissionRate != null) {
    breakdown = `${commission.commissionRate}% επί ${formatEur(commission.grossAmount)} = ${formatEur(commission.commissionAmount)}`
  } else {
    breakdown = `Σταθερή προμήθεια: ${formatEur(commission.commissionAmount)}`
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-lg shadow-lg text-white text-sm font-medium transition-all ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Λεπτομέρειες Προμήθειας</h1>
          <p className="text-xs text-gray-400 font-mono mt-0.5">{commission.id}</p>
        </div>
        <Badge variant={statusVariant[commission.status]}>{statusLabel[commission.status]}</Badge>
      </div>

      {/* Commission Card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="grid grid-cols-2 gap-x-8 gap-y-5">
          <Field
            label="Στάδιο"
            value={
              <Badge variant={commission.stage === 'APPLICATION' ? 'info' : 'secondary'}>
                {stageLabel[commission.stage]}
              </Badge>
            }
          />
          <Field
            label="Αμοιβή Πελάτη"
            value={<span className="font-semibold">{formatEur(commission.grossAmount)}</span>}
          />
          <Field
            label="Υπολογισμός"
            value={<span className="font-mono text-xs bg-gray-50 px-2 py-1 rounded">{breakdown}</span>}
          />
          <Field
            label="Τελική Προμήθεια"
            value={
              <span className="text-xl font-bold text-blue-700">{formatEur(commission.commissionAmount)}</span>
            }
          />
          {commission.notes && (
            <div className="col-span-2">
              <Field label="Σημειώσεις" value={commission.notes} />
            </div>
          )}
        </div>
      </div>

      {/* Parties */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <User size={16} className="text-blue-600" />
            <h3 className="font-semibold text-gray-800 text-sm">Λογιστής</h3>
          </div>
          <dl className="space-y-2">
            <Field label="Γραφείο" value={commission.accountant?.officeName} />
            <Field label="Υπεύθυνος" value={commission.accountant?.contactPerson} />
            <Field label="Email" value={commission.accountant?.email} />
          </dl>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <Building2 size={16} className="text-green-600" />
            <h3 className="font-semibold text-gray-800 text-sm">Επιχείρηση</h3>
          </div>
          <dl className="space-y-2">
            <Field label="Επωνυμία" value={commission.business?.onomasia} />
            <Field label="ΑΦΜ" value={commission.business?.afm} />
            {commission.business?.email && (
              <Field label="Email" value={commission.business.email} />
            )}
          </dl>
        </div>
      </div>

      {/* Payment Request */}
      {commission.paymentRequest && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <CreditCard size={16} className="text-purple-600" />
            <h3 className="font-semibold text-gray-800 text-sm">Συνδεδεμένη Πληρωμή</h3>
          </div>
          <dl className="grid grid-cols-2 gap-4">
            <Field label="Υπηρεσία" value={commission.paymentRequest.service?.name} />
            <Field label="Πρόγραμμα" value={commission.paymentRequest.program?.title} />
            <Field label="Ποσό Πληρωμής" value={formatEur(commission.paymentRequest.amount)} />
            <Field label="Ημ. Πληρωμής" value={commission.paymentRequest.paidAt ? formatDate(commission.paymentRequest.paidAt) : '—'} />
          </dl>
        </div>
      )}

      {/* Status Timeline */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="font-semibold text-gray-800 text-sm mb-4">Χρονολόγιο Κατάστασης</h3>
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-sm">
            <div className="w-2 h-2 rounded-full bg-gray-400" />
            <span className="text-gray-600">Δημιουργία:</span>
            <span className="font-medium">{formatDate(commission.createdAt)}</span>
          </div>
          {commission.approvedAt && (
            <div className="flex items-center gap-3 text-sm">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-gray-600">Έγκριση:</span>
              <span className="font-medium">{formatDate(commission.approvedAt)}</span>
            </div>
          )}
          {commission.paidAt && (
            <div className="flex items-center gap-3 text-sm">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-gray-600">Πληρωμή:</span>
              <span className="font-medium">{formatDate(commission.paidAt)}</span>
            </div>
          )}
          {commission.cancelledAt && (
            <div className="flex items-center gap-3 text-sm">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-gray-600">Ακύρωση:</span>
              <span className="font-medium">{formatDate(commission.cancelledAt)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Invoicing */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="font-semibold text-gray-800 text-sm mb-4">Τιμολόγηση</h3>
        {commission.externalInvoiceId ? (
          <div className="space-y-3">
            <dl className="grid grid-cols-2 gap-4">
              <Field label="Αρ. Τιμολογίου" value={commission.externalInvoiceNo} />
              <Field label="Ημ. Συγχρονισμού" value={commission.externalSyncedAt ? formatDate(commission.externalSyncedAt) : '—'} />
            </dl>
            {commission.externalInvoiceUrl && (
              <a
                href={commission.externalInvoiceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
              >
                Άνοιγμα Τιμολογίου
                <ExternalLink size={14} />
              </a>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Δεν έχει συγχρονιστεί με σύστημα τιμολόγησης.</span>
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={syncInvoice}
                disabled={syncing}
              >
                <RefreshCw size={14} className={`mr-2 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Συγχρονισμός...' : 'Δημιουργία Τιμολογίου'}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Admin Actions */}
      {isAdmin && (
        <div className="flex gap-3">
          {commission.status === 'PENDING' && (
            <>
              <Button onClick={approve} disabled={processing}>
                <CheckCircle size={16} className="mr-2" />
                Έγκριση
              </Button>
              <Button variant="outline" onClick={cancel} disabled={processing} className="text-red-600 border-red-200 hover:bg-red-50">
                <XCircle size={16} className="mr-2" />
                Ακύρωση
              </Button>
            </>
          )}
          {commission.status === 'APPROVED' && (
            <>
              <Button onClick={pay} disabled={processing} className="bg-green-700 hover:bg-green-800">
                <Banknote size={16} className="mr-2" />
                Σήμανση ως Πληρωμένη
              </Button>
              <Button variant="outline" onClick={cancel} disabled={processing} className="text-red-600 border-red-200 hover:bg-red-50">
                <XCircle size={16} className="mr-2" />
                Ακύρωση
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
