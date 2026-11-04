'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Mail, MessageCircle, Send } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

const KIND_OPTIONS = [
  { value: '', label: 'Όλα τα είδη' },
  { value: 'CAMPAIGN', label: 'Καμπάνιες' },
  { value: 'QUICK_SEND', label: 'Γρήγορη Αποστολή' },
  { value: 'ELIGIBILITY', label: 'Email/Viber Επιλεξιμότητας' },
  { value: 'PROGRAM_EMAIL', label: 'Email Προγράμματος' },
]

interface SendItem {
  id: string
  kind: string
  kindLabel: string
  channel: string
  businessId: string | null
  businessName: string | null
  afm: string | null
  accountantName: string | null
  subject: string | null
  recipient: string | null
  success: boolean
  errorMessage: string | null
  sentByName: string | null
  createdAt: string
}

// "Όλες οι Αποστολές" — every send that touched a business, mass or
// individual, campaign or ad-hoc, in one chronological list. See
// /api/message-log for how the underlying sources (CampaignRecipient +
// MessageLog) get merged.
export function AllSendsSection({ accountantOptions }: { accountantOptions?: { id: string; officeName: string }[] }) {
  const [items, setItems] = useState<SendItem[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [kind, setKind] = useState('')
  const [search, setSearch] = useState('')
  const [accountantId, setAccountantId] = useState('')

  const fetchItems = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), limit: '30' })
    if (kind) params.set('kind', kind)
    if (search) params.set('search', search)
    if (accountantId) params.set('accountantId', accountantId)
    fetch(`/api/message-log?${params}`)
      .then(r => r.json())
      .then(d => {
        setItems(d.items || [])
        setHasMore(!!d.hasMore)
      })
      .finally(() => setLoading(false))
  }, [page, kind, search, accountantId])

  useEffect(() => { fetchItems() }, [fetchItems])
  useEffect(() => { setPage(1) }, [kind, search, accountantId])

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-bold text-gray-900 flex items-center gap-2"><Send size={16} className="text-indigo-600" />Όλες οι Αποστολές</h2>
          <p className="text-xs text-gray-500 mt-0.5">Κάθε αποστολή — μεμονωμένη ή μαζική, καμπάνια ή όχι — σε μία λίστα.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            placeholder="Επιχείρηση, ΑΦΜ..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 w-40"
          />
          <select
            value={kind}
            onChange={e => setKind(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
          >
            {KIND_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {accountantOptions && accountantOptions.length > 0 && (
            <select
              value={accountantId}
              onChange={e => setAccountantId(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
            >
              <option value="">Όλα τα γραφεία</option>
              {accountantOptions.map(a => <option key={a.id} value={a.id}>{a.officeName}</option>)}
            </select>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin w-6 h-6 border-4 border-blue-800 border-t-transparent rounded-full" />
        </div>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <Th>Επιχείρηση</Th>
              <Th>Είδος</Th>
              <Th>Κανάλι</Th>
              <Th>Θέμα / Παραλήπτης</Th>
              {accountantOptions && accountantOptions.length > 0 && <Th>Λογιστής</Th>}
              <Th>Κατάσταση</Th>
              <Th>Ημερομηνία</Th>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <Td colSpan={7} className="text-center text-gray-400 py-8">Δεν βρέθηκαν αποστολές</Td>
              </TableRow>
            ) : (
              items.map(item => (
                <TableRow key={item.id}>
                  <Td>
                    {item.businessId ? (
                      <Link href={`/businesses/${item.businessId}`} className="font-medium text-blue-800 hover:underline">
                        {item.businessName || item.afm || '-'}
                      </Link>
                    ) : (
                      <span className="text-gray-500">{item.businessName || item.afm || '-'}</span>
                    )}
                  </Td>
                  <Td className="text-sm text-gray-600">{item.kindLabel}</Td>
                  <Td>
                    {item.channel === 'EMAIL'
                      ? <Mail size={14} className="text-blue-500" />
                      : item.channel === 'VIBER'
                      ? <MessageCircle size={14} className="text-purple-500" />
                      : <span className="text-xs text-gray-400">{item.channel}</span>}
                  </Td>
                  <Td className="text-sm text-gray-500 max-w-[260px] truncate" title={item.subject || item.recipient || ''}>
                    {item.subject || item.recipient || '-'}
                  </Td>
                  {accountantOptions && accountantOptions.length > 0 && (
                    <Td className="text-sm text-gray-600">{item.accountantName || <span className="text-gray-300">—</span>}</Td>
                  )}
                  <Td>
                    {item.success
                      ? <Badge variant="success">Εστάλη</Badge>
                      : <Badge variant="danger" title={item.errorMessage || ''}>Απέτυχε</Badge>}
                  </Td>
                  <Td className="text-sm text-gray-500">{formatDateTime(item.createdAt)}</Td>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}

      {(page > 1 || hasMore) && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="text-sm text-indigo-600 disabled:text-gray-300 hover:underline"
          >
            ← Προηγούμενα
          </button>
          <span className="text-xs text-gray-400">Σελίδα {page}</span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={!hasMore}
            className="text-sm text-indigo-600 disabled:text-gray-300 hover:underline"
          >
            Επόμενα →
          </button>
        </div>
      )}
    </div>
  )
}
