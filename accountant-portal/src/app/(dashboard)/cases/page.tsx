'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/table'
import { MultiSelect } from '@/components/ui/multi-select'
import { NewCaseModal } from '@/components/cases/new-case-modal'
import { Plus } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

const STATUS_LABELS: Record<string, string> = {
  NEW: 'Νέο', ACCEPTED: 'Αποδεκτό', IN_PROGRESS: 'Σε Εξέλιξη',
  WAITING_CLIENT: 'Αναμονή Πελάτη', WAITING_ACCOUNTANT: 'Αναμονή Λογιστή',
  COMPLETED: 'Ολοκληρωμένο', CANCELLED: 'Ακυρωμένο',
}
const STATUS_VARIANT: Record<string, any> = {
  NEW: 'info', ACCEPTED: 'purple', IN_PROGRESS: 'warning',
  WAITING_CLIENT: 'secondary', WAITING_ACCOUNTANT: 'secondary',
  COMPLETED: 'success', CANCELLED: 'danger',
}
const PRIORITY_LABELS: Record<string, string> = { LOW: 'Χαμηλή', NORMAL: 'Κανονική', HIGH: 'Υψηλή', URGENT: 'Επείγον' }
const PRIORITY_VARIANT: Record<string, any> = { LOW: 'secondary', NORMAL: 'info', HIGH: 'warning', URGENT: 'danger' }
const TYPE_LABELS: Record<string, string> = {
  TAKE_OVER: 'Ανάληψη Πελάτη', CONTACT_CLIENT: 'Επικοινωνία με Πελάτη',
  APPLICATION_SUPPORT: 'Υποστήριξη Αίτησης', OTHER: 'Άλλο',
}

export default function CasesPage() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'ADMIN'
  const [cases, setCases] = useState<any[]>([])
  const [accountants, setAccountants] = useState<{ id: string; officeName: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [accountantFilter, setAccountantFilter] = useState<string[]>([])

  async function fetchCases() {
    const params = new URLSearchParams()
    if (statusFilter.length) params.set('statuses', statusFilter.join(','))
    if (accountantFilter.length) params.set('accountantIds', accountantFilter.join(','))
    const res = await fetch(`/api/cases?${params.toString()}`)
    if (res.ok) {
      const d = await res.json()
      setCases(d.cases || [])
      setAccountants(d.accountants || [])
    }
    setLoading(false)
  }

  useEffect(() => { fetchCases() }, [statusFilter, accountantFilter])

  const counts = cases.reduce((acc: Record<string, number>, c) => {
    acc[c.status] = (acc[c.status] || 0) + 1
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Υποθέσεις</h1>
          <p className="text-gray-500 mt-1">{cases.length} υποθέσεις</p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus size={16} className="mr-2" />
          Νέα Ανάθεση
        </Button>
      </div>

      {isAdmin && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(STATUS_LABELS).map(([k, label]) => (
            <Badge key={k} variant={STATUS_VARIANT[k]}>{label}: {counts[k] || 0}</Badge>
          ))}
        </div>
      )}

      {isAdmin && (
        <div className="flex flex-wrap gap-3 items-end">
          <MultiSelect
            label="Κατάσταση"
            placeholder="Όλες οι καταστάσεις"
            options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
            selected={statusFilter}
            onChange={setStatusFilter}
          />
          <MultiSelect
            label="Λογιστές"
            placeholder="Όλοι οι λογιστές"
            options={accountants.map(a => ({ value: a.id, label: a.officeName }))}
            selected={accountantFilter}
            onChange={setAccountantFilter}
          />
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin w-8 h-8 border-4 border-blue-800 border-t-transparent rounded-full" />
          </div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <Th>#</Th>
                <Th>Επιχείρηση</Th>
                {isAdmin && <Th>Λογιστής</Th>}
                <Th>Τύπος</Th>
                <Th>Τίτλος</Th>
                <Th>Προτεραιότητα</Th>
                <Th>Κατάσταση</Th>
                <Th>Ημερομηνία</Th>
              </TableRow>
            </TableHead>
            <TableBody>
              {cases.length === 0 ? (
                <TableRow>
                  <Td colSpan={isAdmin ? 8 : 7} className="text-center text-gray-400 py-8">Δεν βρέθηκαν υποθέσεις</Td>
                </TableRow>
              ) : (
                cases.map(c => (
                  <TableRow key={c.id}>
                    <Td>
                      <Link href={`/cases/${c.id}`} className="font-medium text-blue-800 hover:underline">#{c.caseNumber}</Link>
                    </Td>
                    <Td className="text-sm">
                      <Link href={`/businesses/${c.business?.id}`} className="hover:underline">{c.business?.onomasia || c.business?.afm}</Link>
                    </Td>
                    {isAdmin && <Td className="text-sm text-gray-500">{c.accountant?.officeName}</Td>}
                    <Td className="text-sm text-gray-500">{TYPE_LABELS[c.requestType] || c.requestType}</Td>
                    <Td>
                      <Link href={`/cases/${c.id}`} className="text-sm font-medium text-gray-900 hover:underline">{c.title}</Link>
                    </Td>
                    <Td><Badge variant={PRIORITY_VARIANT[c.priority]}>{PRIORITY_LABELS[c.priority]}</Badge></Td>
                    <Td><Badge variant={STATUS_VARIANT[c.status]}>{STATUS_LABELS[c.status]}</Badge></Td>
                    <Td className="text-sm text-gray-500 whitespace-nowrap">{formatDateTime(c.createdAt)}</Td>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>

      <NewCaseModal open={showNew} onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); fetchCases() }} />
    </div>
  )
}

