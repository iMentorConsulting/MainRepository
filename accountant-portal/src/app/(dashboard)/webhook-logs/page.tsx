'use client'
import React, { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card'
import { Webhook, CheckCircle2, XCircle } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

interface WebhookLogRow {
  id: string
  source: string
  ok: boolean
  summary: string | null
  afm: string | null
  email: string | null
  payload: unknown
  createdAt: string
}

export default function WebhookLogsPage() {
  const { data: session, status } = useSession()
  const [logs, setLogs] = useState<WebhookLogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/webhook-logs?source=moosend-signup')
      .then(r => r.json())
      .then(d => setLogs(d.logs || []))
      .finally(() => setLoading(false))
  }, [])

  if (status === 'loading') return null
  if (session?.user?.role !== 'ADMIN') redirect('/')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Webhook Logs — Moosend Signup</h1>
        <p className="text-sm text-gray-500 mt-1">
          Κάθε κλήση που φτάνει στο <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">/api/public/moosend-signup/…</code> καταγράφεται εδώ, ώστε να επιβεβαιώνετε ότι λαμβάνουμε εγγραφές από το Moosend χωρίς να χρειάζεται πρόσβαση στα logs του Railway.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook size={18} />
            Πρόσφατες Κλήσεις ({logs.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-24">
              <div className="animate-spin w-6 h-6 border-4 border-blue-800 border-t-transparent rounded-full" />
            </div>
          ) : logs.length === 0 ? (
            <p className="text-sm text-gray-400 italic">
              Δεν έχει καταγραφεί καμία κλήση ακόμα — δεν έχουμε λάβει τίποτα από το Moosend webhook μέχρι στιγμής.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    <th className="text-left py-2 pr-4">Κατάσταση</th>
                    <th className="text-left py-2 pr-4">Περίληψη</th>
                    <th className="text-left py-2 pr-4">ΑΦΜ</th>
                    <th className="text-left py-2 pr-4">Email</th>
                    <th className="text-left py-2">Ημερομηνία</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.map(l => (
                    <React.Fragment key={l.id}>
                      <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => setExpanded(expanded === l.id ? null : l.id)}>
                        <td className="py-2 pr-4">
                          {l.ok ? (
                            <CheckCircle2 size={16} className="text-emerald-500" />
                          ) : (
                            <XCircle size={16} className="text-red-500" />
                          )}
                        </td>
                        <td className="py-2 pr-4 text-gray-700">{l.summary || '—'}</td>
                        <td className="py-2 pr-4 text-gray-600 font-mono">{l.afm || '—'}</td>
                        <td className="py-2 pr-4 text-gray-600">{l.email || '—'}</td>
                        <td className="py-2 text-gray-400 whitespace-nowrap">{formatDateTime(l.createdAt)}</td>
                      </tr>
                      {expanded === l.id && l.payload !== null && (
                        <tr>
                          <td colSpan={5} className="bg-gray-50 px-4 py-3">
                            <pre className="text-xs text-gray-600 whitespace-pre-wrap break-all">{JSON.stringify(l.payload, null, 2)}</pre>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
