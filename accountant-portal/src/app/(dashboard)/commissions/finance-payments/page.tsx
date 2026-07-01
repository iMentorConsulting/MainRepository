'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Check, X, Clock3, RefreshCw, UserPlus } from 'lucide-react'

// Services that automatically add a same-name tag when creating a business
const AUTO_TAG_SERVICES = ['ΕΞΩΔΙΚΑΣΤΙΚΟΣ', 'ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ']

function buildCreateUrl(p: any) {
  const params = new URLSearchParams({ afm: p.afm })
  if (p.onomasia) params.set('onomasia', p.onomasia)
  params.set('service', p.serviceName)
  if (AUTO_TAG_SERVICES.some(s => p.serviceName?.toUpperCase().includes(s))) {
    params.set('autoTag', p.serviceName)
  }
  return `/businesses/new?${params}`
}

function formatEur(cents: number) {
  return (cents / 100).toLocaleString('el-GR', { style: 'currency', currency: 'EUR' })
}

const STATUS_LABELS: Record<string, { label: string; variant: any }> = {
  PENDING: { label: 'Σε Εκκρεμότητα', variant: 'secondary' },
  APPROVED: { label: 'Εγκρίθηκε', variant: 'success' },
  REJECTED: { label: 'Απορρίφθηκε', variant: 'danger' },
  DEFERRED: { label: 'Αναβλήθηκε', variant: 'warning' },
}

export default function FinancePaymentsPage() {
  const [payments, setPayments] = useState<any[]>([])
  const [statusFilter, setStatusFilter] = useState('PENDING')
  const [loading, setLoading] = useState(true)
  const [emailsEnabled, setEmailsEnabled] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  const fetchPayments = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/finance-payments?status=${statusFilter}`)
    const data = await res.json()
    setPayments(data.payments || [])
    setLoading(false)
  }, [statusFilter])

  useEffect(() => { fetchPayments() }, [fetchPayments])
  useEffect(() => {
    fetch('/api/finance-payments/settings').then(r => r.json()).then(d => setEmailsEnabled(!!d.financeCommissionEmailsEnabled))
  }, [])

  async function bulkSync() {
    if (!confirm('Συγχρονισμός υπηρεσιών I-MENTOR για όλες τις αντιστοιχισμένες επιχειρήσεις;')) return
    setSyncing(true)
    const res = await fetch('/api/finance-payments/sync-services', { method: 'POST' })
    const data = await res.json()
    setSyncing(false)
    alert(`Συγχρονίστηκαν ${data.updated} επιχειρήσεις`)
    fetchPayments()
  }

  async function toggleEmails() {
    const next = !emailsEnabled
    setEmailsEnabled(next)
    await fetch('/api/finance-payments/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: next }),
    })
  }

  async function act(id: string, action: 'approve' | 'reject' | 'defer' | 'rematch') {
    if (action === 'reject' && !confirm('Απόρριψη πληρωμής;')) return
    setBusyId(id)
    const res = await fetch(`/api/finance-payments/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    const data = await res.json()
    if (!res.ok) alert(data.error || 'Σφάλμα')
    setBusyId(null)
    fetchPayments()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/commissions">
          <Button variant="ghost" size="sm"><ArrowLeft size={16} className="mr-1" />Πίσω</Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Πληρωμές Finance</h1>
          <p className="text-gray-500 mt-1 text-sm">Ημερήσια ροή πληρωμών από το Finance app — έλεγχος & έγκριση προμηθειών</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-wrap items-center gap-4">
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Κατάσταση</label>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          >
            <option value="PENDING">Σε Εκκρεμότητα</option>
            <option value="APPROVED">Εγκρίθηκαν</option>
            <option value="REJECTED">Απορρίφθηκαν</option>
            <option value="DEFERRED">Αναβλήθηκαν</option>
            <option value="ALL">Όλες</option>
          </select>
        </div>
        <Button variant="outline" size="sm" onClick={bulkSync} disabled={syncing} className="ml-auto">
          <RefreshCw size={14} className={`mr-1.5 ${syncing ? 'animate-spin' : ''}`} />
          Συγχρονισμός Υπηρεσιών
        </Button>
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
          <input type="checkbox" checked={emailsEnabled} onChange={toggleEmails} className="rounded border-gray-300" />
          Ενεργοποίηση email προς λογιστές κατά την έγκριση
        </label>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin w-8 h-8 border-4 border-blue-800 border-t-transparent rounded-full" />
          </div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <Th>ΑΦΜ / Επωνυμία</Th>
                <Th>Επιχείρηση</Th>
                <Th>Λογιστής</Th>
                <Th>Ανάθεση</Th>
                <Th>Υπηρεσία</Th>
                <Th>Κατηγορία</Th>
                <Th className="text-xs">Ποσό</Th>
                <Th className="text-xs">Προμήθεια</Th>
                <Th className="text-xs">Ημερομηνία</Th>
                <Th>Κατάσταση</Th>
                <Th />
              </TableRow>
            </TableHead>
            <TableBody>
              {payments.length === 0 ? (
                <TableRow><Td colSpan={11} className="text-center text-gray-400 py-8">Δεν βρέθηκαν πληρωμές</Td></TableRow>
              ) : (
                payments.map(p => (
                  <TableRow key={p.id}>
                    <Td className="text-sm">
                      <div className="font-medium text-gray-900">{p.afm}</div>
                      <div className="text-xs text-gray-500">{p.onomasia || '-'}</div>
                    </Td>
                    <Td className="text-sm">
                      {p.business ? (
                        <Link href={`/businesses/${p.business.id}`} className="text-blue-800 hover:underline">{p.business.onomasia || p.business.afm}</Link>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-amber-600">Δεν βρέθηκε</span>
                          <Link href={buildCreateUrl(p)}>
                            <Button size="sm" variant="outline" className="h-6 px-2 text-xs">
                              <UserPlus size={12} className="mr-1" />Δημιουργία
                            </Button>
                          </Link>
                          <button onClick={() => act(p.id, 'rematch')} className="text-gray-400 hover:text-gray-600" title="Επανέλεγχος αντιστοίχισης">
                            <RefreshCw size={12} />
                          </button>
                        </div>
                      )}
                    </Td>
                    <Td className="text-xs text-gray-500">
                      {p.business?.accountant?.officeName || (p.business ? 'Χωρίς λογιστή' : '-')}
                    </Td>
                    <Td className="text-xs">
                      {p.business ? (
                        p.hasCase ? <Badge variant="success">Ναι</Badge> : <Badge variant="default">Όχι</Badge>
                      ) : '-'}
                    </Td>
                    <Td className="text-xs text-gray-500">{p.serviceName}</Td>
                    <Td className="text-xs text-gray-500">{p.category}</Td>
                    <Td className="text-xs font-medium text-gray-900">{formatEur(p.amount)}</Td>
                    <Td className="text-xs">
                      {p.commission ? (
                        <span className="text-emerald-700 font-medium">{formatEur(p.commission.commissionAmount)}</span>
                      ) : p.commissionPreview ? (
                        <span className="text-gray-600">{formatEur(p.commissionPreview.commissionAmount)} <span className="text-gray-400">(προεπισκόπηση)</span></span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </Td>
                    <Td className="text-xs text-gray-500">
                      {new Date(p.paymentDate).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                    </Td>
                    <Td>
                      <Badge variant={STATUS_LABELS[p.status]?.variant || 'default'}>{STATUS_LABELS[p.status]?.label || p.status}</Badge>
                    </Td>
                    <Td>
                      {p.status === 'PENDING' && (
                        <div className="flex items-center gap-1">
                          <button
                            disabled={busyId === p.id || !p.business?.accountantId}
                            onClick={() => act(p.id, 'approve')}
                            title={!p.business?.accountantId ? 'Χρειάζεται επιχείρηση με λογιστή' : 'Έγκριση'}
                            className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 disabled:opacity-30 transition-colors"
                          >
                            <Check size={16} />
                          </button>
                          <button
                            disabled={busyId === p.id}
                            onClick={() => act(p.id, 'defer')}
                            title="Αναβολή"
                            className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 disabled:opacity-30 transition-colors"
                          >
                            <Clock3 size={16} />
                          </button>
                          <button
                            disabled={busyId === p.id}
                            onClick={() => act(p.id, 'reject')}
                            title="Απόρριψη"
                            className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-30 transition-colors"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      )}
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
