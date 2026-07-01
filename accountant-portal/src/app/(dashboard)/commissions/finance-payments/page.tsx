'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Check, X, Clock3, RefreshCw, UserPlus, RotateCcw, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

function formatEur(cents: number) {
  return (cents / 100).toLocaleString('el-GR', { style: 'currency', currency: 'EUR' })
}

const STATUS_LABELS: Record<string, { label: string; variant: any }> = {
  PENDING: { label: 'Σε Εκκρεμότητα', variant: 'secondary' },
  APPROVED: { label: 'Εγκρίθηκε', variant: 'success' },
  REJECTED: { label: 'Απορρίφθηκε', variant: 'danger' },
  DEFERRED: { label: 'Αναβλήθηκε', variant: 'warning' },
}

type SortKey = 'afm' | 'onomasia' | 'serviceName' | 'category' | 'amount' | 'commissionAmount' | 'paymentDate' | 'status'
type SortDir = 'asc' | 'desc'

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown size={12} className="inline ml-1 text-gray-300" />
  return sortDir === 'asc'
    ? <ChevronUp size={12} className="inline ml-1 text-blue-600" />
    : <ChevronDown size={12} className="inline ml-1 text-blue-600" />
}

export default function FinancePaymentsPage() {
  const [payments, setPayments] = useState<any[]>([])
  const [statusFilter, setStatusFilter] = useState('PENDING')
  const [serviceFilter, setServiceFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [accountantFilter, setAccountantFilter] = useState('')
  const [matchedFilter, setMatchedFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [emailsEnabled, setEmailsEnabled] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('paymentDate')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const fetchPayments = useCallback(async () => {
    setLoading(true)
    setSelected(new Set())
    const res = await fetch(`/api/finance-payments?status=${statusFilter}`)
    const data = await res.json()
    setPayments(data.payments || [])
    setLoading(false)
  }, [statusFilter])

  useEffect(() => { fetchPayments() }, [fetchPayments])
  useEffect(() => {
    fetch('/api/finance-payments/settings').then(r => r.json()).then(d => setEmailsEnabled(!!d.financeCommissionEmailsEnabled))
  }, [])

  // Derived filter options
  const serviceOptions = useMemo(() => Array.from(new Set(payments.map(p => p.serviceName).filter(Boolean))).sort(), [payments])
  const categoryOptions = useMemo(() => Array.from(new Set(payments.map(p => p.category).filter(Boolean))).sort(), [payments])
  const accountantOptions = useMemo(() => Array.from(new Set(payments.map(p => p.business?.accountant?.officeName).filter(Boolean))).sort(), [payments])

  // Filtered + sorted view
  const visible = useMemo(() => {
    let list = payments.filter(p => {
      if (serviceFilter && p.serviceName !== serviceFilter) return false
      if (categoryFilter && p.category !== categoryFilter) return false
      if (accountantFilter && p.business?.accountant?.officeName !== accountantFilter) return false
      if (matchedFilter === 'matched' && !p.business) return false
      if (matchedFilter === 'unmatched' && p.business) return false
      return true
    })
    list = [...list].sort((a, b) => {
      let av: any, bv: any
      switch (sortKey) {
        case 'afm': av = a.afm; bv = b.afm; break
        case 'onomasia': av = a.onomasia || ''; bv = b.onomasia || ''; break
        case 'serviceName': av = a.serviceName || ''; bv = b.serviceName || ''; break
        case 'category': av = a.category || ''; bv = b.category || ''; break
        case 'amount': av = a.amount; bv = b.amount; break
        case 'commissionAmount':
          av = a.commission?.commissionAmount ?? a.commissionPreview?.commissionAmount ?? -1
          bv = b.commission?.commissionAmount ?? b.commissionPreview?.commissionAmount ?? -1
          break
        case 'paymentDate': av = a.paymentDate; bv = b.paymentDate; break
        case 'status': av = a.status; bv = b.status; break
        default: av = ''; bv = ''
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [payments, serviceFilter, categoryFilter, accountantFilter, matchedFilter, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  function thSort(key: SortKey, label: string) {
    return (
      <button onClick={() => toggleSort(key)} className="flex items-center gap-0.5 hover:text-blue-700 transition-colors">
        {label}<SortIcon col={key} sortKey={sortKey} sortDir={sortDir} />
      </button>
    )
  }

  // Selection
  const allVisibleIds = visible.map(p => p.id)
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every(id => selected.has(id))
  const someSelected = allVisibleIds.some(id => selected.has(id))

  function toggleAll() {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(allVisibleIds))
  }
  function toggleOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function act(id: string, action: 'approve' | 'reject' | 'defer' | 'rematch' | 'reset') {
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

  async function bulkAct(action: 'approve' | 'reject' | 'defer') {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    const labels: Record<string, string> = { approve: 'Έγκριση', reject: 'Απόρριψη', defer: 'Αναβολή' }
    if (!confirm(`${labels[action]} ${ids.length} επιλεγμένων πληρωμών;`)) return
    setBulkBusy(true)
    const errors: string[] = []
    for (const id of ids) {
      const res = await fetch(`/api/finance-payments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        const d = await res.json()
        const p = payments.find(x => x.id === id)
        errors.push(`${p?.afm || id}: ${d.error || 'Σφάλμα'}`)
      }
    }
    setBulkBusy(false)
    if (errors.length > 0) alert(`Σφάλματα:\n${errors.join('\n')}`)
    fetchPayments()
  }

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

  async function createBusiness(id: string) {
    setBusyId(id)
    const res = await fetch(`/api/finance-payments/${id}/create-business`, { method: 'POST' })
    const data = await res.json()
    if (!res.ok) alert(data.error || 'Σφάλμα δημιουργίας')
    setBusyId(null)
    fetchPayments()
  }

  async function massCreate() {
    const unmatched = payments.filter(p => !p.business && p.status === 'PENDING')
    if (unmatched.length === 0) { alert('Δεν υπάρχουν αναντιστοίχιστες πληρωμές'); return }
    if (!confirm(`Μαζική δημιουργία ${unmatched.length} επιχειρήσεων από ΑΑΔΕ;`)) return
    setSyncing(true)
    let created = 0
    for (const p of unmatched) {
      const res = await fetch(`/api/finance-payments/${p.id}/create-business`, { method: 'POST' })
      if (res.ok) created++
    }
    setSyncing(false)
    alert(`Δημιουργήθηκαν ${created} επιχειρήσεις`)
    fetchPayments()
  }

  const selectedPending = Array.from(selected).filter(id => payments.find(p => p.id === id)?.status === 'PENDING')

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

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Κατάσταση</label>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white">
            <option value="PENDING">Σε Εκκρεμότητα</option>
            <option value="APPROVED">Εγκρίθηκαν</option>
            <option value="REJECTED">Απορρίφθηκαν</option>
            <option value="DEFERRED">Αναβλήθηκαν</option>
            <option value="ALL">Όλες</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Υπηρεσία</label>
          <select value={serviceFilter} onChange={e => setServiceFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white">
            <option value="">Όλες</option>
            {serviceOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Κατηγορία</label>
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white">
            <option value="">Όλες</option>
            {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Λογιστής</label>
          <select value={accountantFilter} onChange={e => setAccountantFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white min-w-[160px]">
            <option value="">Όλοι</option>
            {accountantOptions.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Αντιστοίχιση</label>
          <select value={matchedFilter} onChange={e => setMatchedFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white">
            <option value="">Όλες</option>
            <option value="matched">Αντιστοιχισμένες</option>
            <option value="unmatched">Χωρίς αντιστοίχιση</option>
          </select>
        </div>
        <div className="ml-auto flex gap-2 flex-wrap justify-end">
          <Button variant="outline" size="sm" onClick={massCreate} disabled={syncing}>
            <UserPlus size={14} className="mr-1.5" />
            Μαζική Δημιουργία
          </Button>
          <Button variant="outline" size="sm" onClick={bulkSync} disabled={syncing}>
            <RefreshCw size={14} className={`mr-1.5 ${syncing ? 'animate-spin' : ''}`} />
            Συγχρονισμός Υπηρεσιών
          </Button>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none w-full">
          <input type="checkbox" checked={emailsEnabled} onChange={toggleEmails} className="rounded border-gray-300" />
          Ενεργοποίηση email προς λογιστές κατά την έγκριση
        </label>
      </div>

      {/* Bulk action bar */}
      {someSelected && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-blue-800">{selected.size} επιλεγμένες</span>
          <span className="text-blue-300">|</span>
          <button
            disabled={bulkBusy || selectedPending.length === 0}
            onClick={() => bulkAct('approve')}
            className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:text-emerald-900 disabled:opacity-40 transition-colors"
          >
            <Check size={15} /> Μαζική Έγκριση ({selectedPending.length})
          </button>
          <button
            disabled={bulkBusy || selectedPending.length === 0}
            onClick={() => bulkAct('defer')}
            className="flex items-center gap-1.5 text-sm font-medium text-amber-700 hover:text-amber-900 disabled:opacity-40 transition-colors"
          >
            <Clock3 size={15} /> Μαζική Αναβολή ({selectedPending.length})
          </button>
          <button
            disabled={bulkBusy || selectedPending.length === 0}
            onClick={() => bulkAct('reject')}
            className="flex items-center gap-1.5 text-sm font-medium text-red-700 hover:text-red-900 disabled:opacity-40 transition-colors"
          >
            <X size={15} /> Μαζική Απόρριψη ({selectedPending.length})
          </button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-blue-600 hover:underline">
            Αποεπιλογή όλων
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin w-8 h-8 border-4 border-blue-800 border-t-transparent rounded-full" />
          </div>
        ) : (
          <>
            <div className="px-4 py-2 border-b border-gray-100 text-xs text-gray-500">
              {visible.length} από {payments.length} εγγραφές
            </div>
            <Table>
              <TableHead>
                <TableRow>
                  <Th className="w-8">
                    <input type="checkbox" checked={allSelected} ref={el => { if (el) el.indeterminate = someSelected && !allSelected }}
                      onChange={toggleAll} className="rounded border-gray-300 cursor-pointer" />
                  </Th>
                  <Th>{thSort('afm', 'ΑΦΜ / Επωνυμία')}</Th>
                  <Th>{thSort('onomasia', 'Επιχείρηση')}</Th>
                  <Th>Λογιστής</Th>
                  <Th>Ανάθεση</Th>
                  <Th>{thSort('serviceName', 'Υπηρεσία')}</Th>
                  <Th>{thSort('category', 'Κατηγορία')}</Th>
                  <Th>{thSort('amount', 'Ποσό')}</Th>
                  <Th>{thSort('commissionAmount', 'Προμήθεια')}</Th>
                  <Th>{thSort('paymentDate', 'Ημερομηνία')}</Th>
                  <Th>{thSort('status', 'Κατάσταση')}</Th>
                  <Th />
                </TableRow>
              </TableHead>
              <TableBody>
                {visible.length === 0 ? (
                  <TableRow><Td colSpan={12} className="text-center text-gray-400 py-8">Δεν βρέθηκαν πληρωμές</Td></TableRow>
                ) : (
                  visible.map(p => (
                    <TableRow key={p.id} className={selected.has(p.id) ? 'bg-blue-50/50' : ''}>
                      <Td>
                        <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleOne(p.id)}
                          className="rounded border-gray-300 cursor-pointer" />
                      </Td>
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
                            <Button size="sm" variant="outline" className="h-6 px-2 text-xs"
                              disabled={busyId === p.id} onClick={() => createBusiness(p.id)}>
                              <UserPlus size={12} className="mr-1" />
                              {busyId === p.id ? '...' : 'Δημιουργία'}
                            </Button>
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
                          <span className="text-gray-600">{formatEur(p.commissionPreview.commissionAmount)} <span className="text-gray-400">(εκτίμηση)</span></span>
                        ) : p.business?.accountantId ? (
                          <span className="text-amber-600 font-medium" title="Δεν υπάρχει πολιτική προμηθειών για αυτή την υπηρεσία/στάδιο">⚠ Χωρίς πολιτική</span>
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
                        {p.status === 'PENDING' ? (
                          <div className="flex items-center gap-1">
                            <button
                              disabled={busyId === p.id || !p.business?.accountantId || !p.commissionPreview}
                              onClick={() => act(p.id, 'approve')}
                              title={!p.business?.accountantId ? 'Χρειάζεται επιχείρηση με λογιστή' : !p.commissionPreview ? 'Χρειάζεται πολιτική προμηθειών' : 'Έγκριση'}
                              className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 disabled:opacity-30 transition-colors"
                            >
                              <Check size={16} />
                            </button>
                            <button disabled={busyId === p.id} onClick={() => act(p.id, 'defer')} title="Αναβολή"
                              className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 disabled:opacity-30 transition-colors">
                              <Clock3 size={16} />
                            </button>
                            <button disabled={busyId === p.id} onClick={() => act(p.id, 'reject')} title="Απόρριψη"
                              className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-30 transition-colors">
                              <X size={16} />
                            </button>
                          </div>
                        ) : (
                          <button disabled={busyId === p.id}
                            onClick={() => { if (confirm('Επαναφορά σε Εκκρεμότητα;')) act(p.id, 'reset') }}
                            title="Επαναφορά σε Εκκρεμότητα"
                            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30 transition-colors">
                            <RotateCcw size={16} />
                          </button>
                        )}
                      </Td>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </>
        )}
      </div>
    </div>
  )
}
