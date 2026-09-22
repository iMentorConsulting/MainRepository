'use client'
import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card'
import { Search, CheckCircle2, XCircle } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

interface AadeLookupRow {
  id: string
  afm: string
  success: boolean
  errorCode: string | null
  createdAt: string
}

export default function AadeLookupsPage() {
  const { data: session, status } = useSession()
  const [afm, setAfm] = useState('')
  const [lookups, setLookups] = useState<AadeLookupRow[]>([])
  const [count, setCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  if (status === 'loading') return null
  if (session?.user?.role !== 'ADMIN') redirect('/')

  async function search() {
    setLoading(true)
    setSearched(true)
    try {
      const params = new URLSearchParams()
      if (afm.trim()) params.set('afm', afm.trim())
      const res = await fetch(`/api/admin/aade-lookups?${params}`)
      const data = await res.json()
      setLookups(data.lookups || [])
      setCount(data.count ?? null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Αναζητήσεις ΑΑΔΕ</h1>
        <p className="text-sm text-gray-500 mt-1">
          Κάθε αναζήτηση ΑΦΜ στην ΑΑΔΕ (από οποιαδήποτε ροή — εισαγωγή επιχειρήσεων, Ermis, website widget, Case Management κ.λπ.) καταγράφεται εδώ, ώστε να ελέγχετε πόσες φορές έχετε αναζητήσει ένα συγκεκριμένο ΑΦΜ.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>Αναζήτηση ανά ΑΦΜ</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <input
              type="text"
              value={afm}
              onChange={e => setAfm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && search()}
              placeholder="π.χ. 123456789 (αφήστε κενό για τις πιο πρόσφατες 200 αναζητήσεις)"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={search}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-800 text-white text-sm font-medium hover:bg-blue-900 disabled:opacity-60"
            >
              <Search size={15} />
              Αναζήτηση
            </button>
          </div>
        </CardContent>
      </Card>

      {searched && (
        <Card>
          <CardHeader>
            <CardTitle>
              {afm.trim() ? `Αποτελέσματα για ΑΦΜ ${afm.trim()}` : 'Πιο πρόσφατες αναζητήσεις'}
              {count !== null && <span className="ml-2 text-sm font-normal text-gray-500">— {count} συνολικά</span>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center h-24">
                <div className="animate-spin w-6 h-6 border-4 border-blue-800 border-t-transparent rounded-full" />
              </div>
            ) : lookups.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Δεν βρέθηκαν αναζητήσεις.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      <th className="text-left py-2 pr-4">Κατάσταση</th>
                      <th className="text-left py-2 pr-4">ΑΦΜ</th>
                      <th className="text-left py-2 pr-4">Σφάλμα</th>
                      <th className="text-left py-2">Ημερομηνία</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {lookups.map(l => (
                      <tr key={l.id} className="hover:bg-gray-50">
                        <td className="py-2 pr-4">
                          {l.success ? (
                            <CheckCircle2 size={16} className="text-emerald-500" />
                          ) : (
                            <XCircle size={16} className="text-red-500" />
                          )}
                        </td>
                        <td className="py-2 pr-4 text-gray-700 font-mono">{l.afm}</td>
                        <td className="py-2 pr-4 text-gray-500">{l.errorCode || '—'}</td>
                        <td className="py-2 text-gray-400 whitespace-nowrap">{formatDateTime(l.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
