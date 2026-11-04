'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/table'
import { FileSignature } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

interface ContractRow {
  id: string
  accountantId: string
  officeOnomasia: string | null
  officeAfm: string | null
  signerName: string
  uniqueCode: string
  signedAt: string
  accountant: { officeName: string; email: string }
}

// Admin-only, on /commissions — every signed accountant↔I-MENTOR commission
// contract in one list.
export function AccountantContractsAdminList() {
  const [contracts, setContracts] = useState<ContractRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    setLoading(true)
    const params = search ? `?search=${encodeURIComponent(search)}` : ''
    fetch(`/api/admin/accountant-contracts${params}`)
      .then(r => r.json())
      .then(d => setContracts(d.contracts || []))
      .finally(() => setLoading(false))
  }, [search])

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
        <h2 className="font-bold text-gray-900 flex items-center gap-2"><FileSignature size={16} className="text-indigo-600" />Υπογεγραμμένες Συμβάσεις ({contracts.length})</h2>
        <input
          type="text"
          placeholder="Γραφείο, ΑΦΜ, κωδικός..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 w-56"
        />
      </div>
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin w-6 h-6 border-4 border-blue-800 border-t-transparent rounded-full" />
        </div>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <Th>Γραφείο</Th>
              <Th>ΑΦΜ</Th>
              <Th>Υπογράφων</Th>
              <Th>Κωδικός</Th>
              <Th>Ημερομηνία</Th>
              <Th></Th>
            </TableRow>
          </TableHead>
          <TableBody>
            {contracts.length === 0 ? (
              <TableRow><Td colSpan={6} className="text-center text-gray-400 py-8">Δεν υπάρχουν υπογεγραμμένες συμβάσεις</Td></TableRow>
            ) : (
              contracts.map(c => (
                <TableRow key={c.id}>
                  <Td className="font-medium text-gray-800">{c.officeOnomasia || c.accountant.officeName}</Td>
                  <Td className="text-sm text-gray-500">{c.officeAfm || '-'}</Td>
                  <Td className="text-sm text-gray-500">{c.signerName}</Td>
                  <Td className="text-sm font-mono text-gray-500">{c.uniqueCode}</Td>
                  <Td className="text-sm text-gray-500">{formatDateTime(c.signedAt)}</Td>
                  <Td>
                    <Link href={`/commissions/contract?accountantId=${c.accountantId}`} className="text-sm text-indigo-600 hover:underline">
                      Προβολή
                    </Link>
                  </Td>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
