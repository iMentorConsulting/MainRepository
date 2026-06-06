'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/table'
import { Pagination } from '@/components/ui/pagination'
import { Plus, Search, Download, Upload, Filter } from 'lucide-react'

interface Business {
  id: string
  afm: string
  onomasia: string | null
  postalAreaDescription: string | null
  postalZipCode: string | null
  legalStatusDescr: string | null
  accountant: { officeName: string } | null
  activities: { firmActCode: string; firmActKind: number | null }[]
}

const PAGE_SIZE = 20

export default function BusinessesPage() {
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
      ...(search ? { search } : {}),
    })
    const res = await fetch(`/api/businesses?${params}`)
    const data = await res.json()
    setBusinesses(data.businesses || [])
    setTotal(data.total || 0)
    setLoading(false)
  }, [page, search])

  useEffect(() => { fetchData() }, [fetchData])

  function handleSearch() {
    setSearch(searchInput)
    setPage(1)
  }

  async function handleExport() {
    const res = await fetch('/api/businesses/export')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'businesses.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Επιχειρήσεις</h1>
          <p className="text-gray-500 mt-1">{total} επιχειρήσεις συνολικά</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport} size="sm">
            <Download size={16} className="mr-1" />
            Export Excel
          </Button>
          <Link href="/businesses/new">
            <Button size="sm">
              <Plus size={16} className="mr-1" />
              Νέα Επιχείρηση
            </Button>
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-4 border-b border-gray-100 flex gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Αναζήτηση ΑΦΜ, επωνυμία..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <Button variant="outline" size="sm" onClick={handleSearch}>
            <Filter size={14} className="mr-1" />
            Φίλτρα
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin w-8 h-8 border-4 border-blue-800 border-t-transparent rounded-full" />
          </div>
        ) : (
          <>
            <Table>
              <TableHead>
                <TableRow>
                  <Th>ΑΦΜ</Th>
                  <Th>Επωνυμία</Th>
                  <Th>Κύρια ΚΑΔ</Th>
                  <Th>Περιοχή</Th>
                  <Th>ΤΚ</Th>
                  <Th>Λογιστής</Th>
                  <Th>Μορφή</Th>
                </TableRow>
              </TableHead>
              <TableBody>
                {businesses.length === 0 ? (
                  <TableRow>
                    <Td colSpan={7} className="text-center text-gray-400 py-8">
                      Δεν βρέθηκαν επιχειρήσεις
                    </Td>
                  </TableRow>
                ) : (
                  businesses.map(b => {
                    const primaryKad = b.activities?.find(a => a.firmActKind === 1)
                    return (
                      <TableRow key={b.id}>
                        <Td>
                          <Link href={`/businesses/${b.id}`} className="font-mono text-blue-800 hover:underline">
                            {b.afm}
                          </Link>
                        </Td>
                        <Td className="max-w-xs truncate font-medium">{b.onomasia || '-'}</Td>
                        <Td className="font-mono text-xs">{primaryKad?.firmActCode || '-'}</Td>
                        <Td>{b.postalAreaDescription || '-'}</Td>
                        <Td className="font-mono text-xs">{b.postalZipCode || '-'}</Td>
                        <Td className="text-gray-500 text-xs">{b.accountant?.officeName || '-'}</Td>
                        <Td>
                          {b.legalStatusDescr && (
                            <Badge variant="secondary" className="text-xs">{b.legalStatusDescr}</Badge>
                          )}
                        </Td>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </>
        )}
      </div>
    </div>
  )
}
