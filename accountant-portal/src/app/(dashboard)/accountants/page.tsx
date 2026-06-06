'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/table'
import { Plus, Search, Edit, Trash2, Building2 } from 'lucide-react'

interface Accountant {
  id: string
  officeName: string
  contactPerson: string
  email: string
  phone: string | null
  active: boolean
  _count: { businesses: number; users: number }
}

export default function AccountantsPage() {
  const [accountants, setAccountants] = useState<Accountant[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/accountants')
      .then(r => r.json())
      .then(data => setAccountants(data.accountants || []))
      .finally(() => setLoading(false))
  }, [])

  const filtered = accountants.filter(a =>
    a.officeName.toLowerCase().includes(search.toLowerCase()) ||
    a.contactPerson.toLowerCase().includes(search.toLowerCase()) ||
    a.email.toLowerCase().includes(search.toLowerCase())
  )

  async function handleDelete(id: string) {
    if (!confirm('Διαγραφή λογιστή; Αυτή η ενέργεια είναι μη αναστρέψιμη.')) return
    await fetch(`/api/accountants/${id}`, { method: 'DELETE' })
    setAccountants(prev => prev.filter(a => a.id !== id))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Λογιστές</h1>
          <p className="text-gray-500 mt-1">Διαχείριση λογιστικών γραφείων</p>
        </div>
        <Link href="/accountants/new">
          <Button>
            <Plus size={16} className="mr-2" />
            Νέος Λογιστής
          </Button>
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-4 border-b border-gray-100">
          <div className="relative max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Αναζήτηση λογιστή..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin w-8 h-8 border-4 border-blue-800 border-t-transparent rounded-full" />
          </div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <Th>Γραφείο</Th>
                <Th>Υπεύθυνος</Th>
                <Th>Email</Th>
                <Th>Τηλέφωνο</Th>
                <Th>Επιχειρήσεις</Th>
                <Th>Κατάσταση</Th>
                <Th>Ενέργειες</Th>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <Td colSpan={7} className="text-center text-gray-400 py-8">
                    Δεν βρέθηκαν λογιστές
                  </Td>
                </TableRow>
              ) : (
                filtered.map(a => (
                  <TableRow key={a.id}>
                    <Td>
                      <Link href={`/accountants/${a.id}`} className="font-medium text-blue-800 hover:underline">
                        {a.officeName}
                      </Link>
                    </Td>
                    <Td>{a.contactPerson}</Td>
                    <Td className="text-gray-500">{a.email}</Td>
                    <Td className="text-gray-500">{a.phone || '-'}</Td>
                    <Td>
                      <span className="flex items-center gap-1">
                        <Building2 size={14} className="text-gray-400" />
                        {a._count.businesses}
                      </span>
                    </Td>
                    <Td>
                      <Badge variant={a.active ? 'success' : 'secondary'}>
                        {a.active ? 'Ενεργός' : 'Ανενεργός'}
                      </Badge>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Link href={`/accountants/${a.id}`}>
                          <Button variant="ghost" size="sm">
                            <Edit size={14} />
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(a.id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 size={14} />
                        </Button>
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
