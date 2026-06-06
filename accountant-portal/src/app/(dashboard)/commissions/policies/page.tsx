'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/table'
import { Plus, Pencil, Trash2, X } from 'lucide-react'

function formatEur(cents: number) {
  return (cents / 100).toLocaleString('el-GR', { style: 'currency', currency: 'EUR' })
}

const typeLabel: Record<string, string> = {
  FIXED: 'Σταθερή',
  PERCENTAGE: 'Ποσοστό',
  PERCENTAGE_WITH_MIN: 'Ποσοστό με Ελάχιστο',
  PERCENTAGE_WITH_MAX: 'Ποσοστό με Μέγιστο',
  PERCENTAGE_WITH_MIN_MAX: 'Ποσοστό με Όρια',
}

const COMMISSION_TYPES = Object.keys(typeLabel)

interface PolicyForm {
  name: string
  description: string
  commissionType: string
  fixedAmount: string
  percentage: string
  minAmount: string
  maxAmount: string
  appliesToApplication: boolean
  appliesToImplementation: boolean
  serviceId: string
  programId: string
  active: boolean
}

const emptyForm: PolicyForm = {
  name: '',
  description: '',
  commissionType: 'PERCENTAGE',
  fixedAmount: '',
  percentage: '',
  minAmount: '',
  maxAmount: '',
  appliesToApplication: true,
  appliesToImplementation: false,
  serviceId: '',
  programId: '',
  active: true,
}

function PolicyModal({
  initial,
  services,
  programs,
  onClose,
  onSaved,
}: {
  initial?: any
  services: any[]
  programs: any[]
  onClose: () => void
  onSaved: () => void
}) {
  const editing = !!initial
  const [form, setForm] = useState<PolicyForm>(
    initial
      ? {
          name: initial.name,
          description: initial.description || '',
          commissionType: initial.commissionType,
          fixedAmount: initial.fixedAmount ? String(initial.fixedAmount / 100) : '',
          percentage: initial.percentage != null ? String(initial.percentage) : '',
          minAmount: initial.minAmount ? String(initial.minAmount / 100) : '',
          maxAmount: initial.maxAmount ? String(initial.maxAmount / 100) : '',
          appliesToApplication: initial.appliesToApplication,
          appliesToImplementation: initial.appliesToImplementation,
          serviceId: initial.serviceId || '',
          programId: initial.programId || '',
          active: initial.active,
        }
      : emptyForm
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function set(key: keyof PolicyForm, value: any) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name) { setError('Το όνομα είναι υποχρεωτικό'); return }
    setSaving(true)
    setError('')

    const body: any = {
      name: form.name,
      description: form.description || null,
      commissionType: form.commissionType,
      appliesToApplication: form.appliesToApplication,
      appliesToImplementation: form.appliesToImplementation,
      serviceId: form.serviceId || null,
      programId: form.programId || null,
      active: form.active,
    }

    if (form.commissionType === 'FIXED') {
      body.fixedAmount = form.fixedAmount ? Math.round(parseFloat(form.fixedAmount) * 100) : null
    } else {
      body.percentage = form.percentage ? parseFloat(form.percentage) : null
      body.minAmount = form.minAmount ? Math.round(parseFloat(form.minAmount) * 100) : null
      body.maxAmount = form.maxAmount ? Math.round(parseFloat(form.maxAmount) * 100) : null
    }

    const url = editing ? `/api/commissions/policies/${initial.id}` : '/api/commissions/policies'
    const method = editing ? 'PUT' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      onSaved()
      onClose()
    } else {
      const data = await res.json()
      setError(data.error || 'Σφάλμα αποθήκευσης')
    }
    setSaving(false)
  }

  const needsFixed = form.commissionType === 'FIXED'
  const needsPercentage = form.commissionType !== 'FIXED'
  const needsMin = ['PERCENTAGE_WITH_MIN', 'PERCENTAGE_WITH_MIN_MAX'].includes(form.commissionType)
  const needsMax = ['PERCENTAGE_WITH_MAX', 'PERCENTAGE_WITH_MIN_MAX'].includes(form.commissionType)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">
            {editing ? 'Επεξεργασία Πολιτικής' : 'Νέα Πολιτική Προμήθειας'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>
        {error && <div className="mb-4 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Όνομα *</label>
            <input
              type="text"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="π.χ. Προμήθεια ΕΣΠΑ 20%"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Περιγραφή</label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Τύπος Προμήθειας *</label>
            <select
              value={form.commissionType}
              onChange={e => set('commissionType', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {COMMISSION_TYPES.map(t => (
                <option key={t} value={t}>{typeLabel[t]}</option>
              ))}
            </select>
          </div>

          {needsFixed && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Σταθερό Ποσό (€)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.fixedAmount}
                onChange={e => set('fixedAmount', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="π.χ. 50.00"
              />
            </div>
          )}

          {needsPercentage && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ποσοστό (%)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={form.percentage}
                onChange={e => set('percentage', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="π.χ. 20"
              />
            </div>
          )}

          {needsMin && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ελάχιστη Προμήθεια (€)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.minAmount}
                onChange={e => set('minAmount', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="π.χ. 30.00"
              />
            </div>
          )}

          {needsMax && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Μέγιστη Προμήθεια (€)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.maxAmount}
                onChange={e => set('maxAmount', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="π.χ. 200.00"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Εφαρμόζεται στα Στάδια</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.appliesToApplication}
                  onChange={e => set('appliesToApplication', e.target.checked)}
                  className="rounded"
                />
                Αμοιβή Αίτησης
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.appliesToImplementation}
                  onChange={e => set('appliesToImplementation', e.target.checked)}
                  className="rounded"
                />
                Αμοιβή Υλοποίησης
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Σύνδεση με Υπηρεσία</label>
              <select
                value={form.serviceId}
                onChange={e => set('serviceId', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Χωρίς σύνδεση</option>
                {services.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Σύνδεση με Πρόγραμμα</label>
              <select
                value={form.programId}
                onChange={e => set('programId', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Χωρίς σύνδεση</option>
                {programs.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.active}
                onChange={e => set('active', e.target.checked)}
                className="rounded"
              />
              Ενεργή πολιτική
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Ακύρωση</Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Αποθήκευση...' : editing ? 'Ενημέρωση' : 'Δημιουργία'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function CommissionPoliciesPage() {
  const { data: session } = useSession()
  const [policies, setPolicies] = useState<any[]>([])
  const [services, setServices] = useState<any[]>([])
  const [programs, setPrograms] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<null | 'create' | any>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  if (session && session.user.role !== 'ADMIN') {
    redirect('/')
  }

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  async function load() {
    setLoading(true)
    const [polRes, svcRes, prgRes] = await Promise.all([
      fetch('/api/commissions/policies'),
      fetch('/api/payments/services'),
      fetch('/api/programs'),
    ])
    const [pol, svc, prg] = await Promise.all([polRes.json(), svcRes.json(), prgRes.json()])
    setPolicies(Array.isArray(pol) ? pol : [])
    setServices(Array.isArray(svc) ? svc : [])
    setPrograms(Array.isArray(prg) ? prg : prg.programs || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function deletePolicy(id: string) {
    if (!confirm('Διαγραφή πολιτικής;')) return
    const res = await fetch(`/api/commissions/policies/${id}`, { method: 'DELETE' })
    if (res.ok) {
      showToast('Η πολιτική διαγράφηκε.')
      setPolicies(prev => prev.filter(p => p.id !== id))
    } else {
      showToast('Σφάλμα διαγραφής', 'error')
    }
  }

  function appliesTo(p: any): string {
    if (p.appliesToApplication && p.appliesToImplementation) return 'ΚΑΙ ΤΑ ΔΥΟ'
    if (p.appliesToApplication) return 'ΑΙΤΗΣΗ'
    if (p.appliesToImplementation) return 'ΥΛΟΠΟΙΗΣΗ'
    return '—'
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-lg shadow-lg text-white text-sm font-medium transition-all ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      {modal && (
        <PolicyModal
          initial={modal === 'create' ? undefined : modal}
          services={services}
          programs={programs}
          onClose={() => setModal(null)}
          onSaved={() => { load(); showToast('Αποθηκεύτηκε!') }}
        />
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Πολιτικές Προμηθειών</h1>
          <p className="text-gray-500 mt-1">Διαχείριση πολιτικών προμηθειών για υπηρεσίες και προγράμματα</p>
        </div>
        <Button onClick={() => setModal('create')}>
          <Plus size={16} className="mr-2" />
          Νέα Πολιτική
        </Button>
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
                <Th>Όνομα</Th>
                <Th>Τύπος</Th>
                <Th>Ποσοστό / Ποσό</Th>
                <Th>Ελάχιστο</Th>
                <Th>Μέγιστο</Th>
                <Th>Εφαρμόζεται στο</Th>
                <Th>Υπηρεσία / Πρόγραμμα</Th>
                <Th>Κατάσταση</Th>
                <Th>Ενέργειες</Th>
              </TableRow>
            </TableHead>
            <TableBody>
              {policies.length === 0 ? (
                <TableRow>
                  <Td colSpan={9} className="text-center text-gray-400 py-8">
                    Δεν βρέθηκαν πολιτικές προμηθειών
                  </Td>
                </TableRow>
              ) : (
                policies.map(p => (
                  <TableRow key={p.id}>
                    <Td>
                      <div className="font-medium text-sm">{p.name}</div>
                      {p.description && <div className="text-xs text-gray-400">{p.description}</div>}
                    </Td>
                    <Td className="text-sm">{typeLabel[p.commissionType] || p.commissionType}</Td>
                    <Td className="text-sm font-medium text-gray-900">
                      {p.commissionType === 'FIXED'
                        ? p.fixedAmount != null ? formatEur(p.fixedAmount) : '—'
                        : p.percentage != null ? `${p.percentage}%` : '—'}
                    </Td>
                    <Td className="text-sm text-gray-600">
                      {p.minAmount != null ? formatEur(p.minAmount) : '—'}
                    </Td>
                    <Td className="text-sm text-gray-600">
                      {p.maxAmount != null ? formatEur(p.maxAmount) : '—'}
                    </Td>
                    <Td>
                      <Badge variant="secondary">{appliesTo(p)}</Badge>
                    </Td>
                    <Td className="text-sm text-gray-600">
                      {p.service?.name && <div>{p.service.name}</div>}
                      {p.program?.title && <div className="text-xs text-gray-400">{p.program.title}</div>}
                      {!p.service && !p.program && '—'}
                    </Td>
                    <Td>
                      <Badge variant={p.active ? 'success' : 'secondary'}>
                        {p.active ? 'Ενεργή' : 'Ανενεργή'}
                      </Badge>
                    </Td>
                    <Td>
                      <div className="flex gap-1">
                        <button
                          onClick={() => setModal(p)}
                          className="p-1.5 rounded hover:bg-blue-50 text-blue-600"
                          title="Επεξεργασία"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => deletePolicy(p.id)}
                          className="p-1.5 rounded hover:bg-red-50 text-red-500"
                          title="Διαγραφή"
                        >
                          <Trash2 size={14} />
                        </button>
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
