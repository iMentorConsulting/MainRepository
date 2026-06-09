'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/table'
import { Plus, Mail, MessageCircle, Send, Users, FileText, CheckCircle2, Sparkles, ArrowRight } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

const statusVariant: Record<string, any> = { DRAFT: 'secondary', SCHEDULED: 'warning', SENT: 'success' }
const statusLabel: Record<string, string> = { DRAFT: 'Πρόχειρο', SCHEDULED: 'Προγρ/νο', SENT: 'Απεστάλη' }

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/campaigns')
      .then(r => r.json())
      .then(d => setCampaigns(d.campaigns || []))
      .finally(() => setLoading(false))
  }, [])

  const sent      = campaigns.filter(c => c.status === 'SENT')
  const drafts    = campaigns.filter(c => c.status === 'DRAFT')
  const totalReach = sent.reduce((s, c) => s + (c._count?.recipients ?? 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Καμπάνιες</h1>
          <p className="text-gray-500 mt-1">{campaigns.length} καμπάνιες</p>
        </div>
        <div className="flex gap-2">
          <Link href="/campaigns/analytics">
            <Button variant="outline">Analytics</Button>
          </Link>
          <Link href="/campaigns/new">
            <Button><Plus size={16} className="mr-2" />Νέα Καμπάνια</Button>
          </Link>
        </div>
      </div>

      {/* ── Quick-start wizard cards ────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link href="/campaigns/new?path=diy">
          <div className="group p-5 rounded-2xl border-2 border-indigo-100 hover:border-indigo-400 hover:bg-indigo-50 transition-all cursor-pointer">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-200 transition-colors">
                <Send size={20} className="text-indigo-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-gray-900 text-base">Θα το κάνω μόνος μου</h3>
                <p className="text-sm text-gray-500 mt-0.5">Βήμα-βήμα, απλά και γρήγορα. Δεν χρειάζεται τεχνική γνώση.</p>
                <span className="mt-2 inline-flex items-center gap-1 text-sm text-indigo-600 font-semibold">
                  Ξεκινήστε <ArrowRight size={14} />
                </span>
              </div>
            </div>
          </div>
        </Link>

        <Link href="/campaigns/new?path=imentor">
          <div className="group p-5 rounded-2xl border-2 border-purple-100 hover:border-purple-400 hover:bg-purple-50 transition-all cursor-pointer">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 bg-purple-100 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-purple-200 transition-colors">
                <Sparkles size={20} className="text-purple-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-gray-900 text-base">Να το κάνουμε παρέα με I-MENTOR</h3>
                <p className="text-sm text-gray-500 mt-0.5">Στέλνουμε εμείς για λογαριασμό σας — απλά μας πείτε σε ποιους.</p>
                <span className="mt-2 inline-flex items-center gap-1 text-sm text-purple-600 font-semibold">
                  Ζητήστε βοήθεια <ArrowRight size={14} />
                </span>
              </div>
            </div>
          </div>
        </Link>
      </div>

      {/* ── Stat cards ─────────────────────────────────────────────────── */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 flex-shrink-0">
              <Send size={18} className="text-indigo-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{sent.length}</p>
              <p className="text-xs text-gray-400">Απεστάλησαν</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-green-50 flex-shrink-0">
              <Users size={18} className="text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{totalReach}</p>
              <p className="text-xs text-gray-400">Παραλήπτες (σύνολο)</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-50 flex-shrink-0">
              <FileText size={18} className="text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{drafts.length}</p>
              <p className="text-xs text-gray-400">Πρόχειρα</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-50 flex-shrink-0">
              <CheckCircle2 size={18} className="text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {sent.length > 0 ? Math.round(totalReach / sent.length) : '—'}
              </p>
              <p className="text-xs text-gray-400">Μέσος όρος/καμπάνια</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Table ──────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin w-8 h-8 border-4 border-blue-800 border-t-transparent rounded-full" />
          </div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <Th>Τίτλος</Th>
                <Th>Κανάλι</Th>
                <Th>Πρόγραμμα</Th>
                <Th>Παραλήπτες</Th>
                <Th>Κατάσταση</Th>
                <Th>Ημερομηνία</Th>
              </TableRow>
            </TableHead>
            <TableBody>
              {campaigns.length === 0 ? (
                <TableRow>
                  <Td colSpan={6} className="text-center text-gray-400 py-8">Δεν υπάρχουν καμπάνιες</Td>
                </TableRow>
              ) : (
                campaigns.map(c => (
                  <TableRow key={c.id}>
                    <Td>
                      <Link href={`/campaigns/${c.id}`} className="font-medium text-blue-800 hover:underline">{c.title}</Link>
                    </Td>
                    <Td>
                      <span className="flex items-center gap-1 text-sm">
                        {c.channel === 'EMAIL' ? <Mail size={14} className="text-blue-500" /> : <MessageCircle size={14} className="text-purple-500" />}
                        {c.channel}
                      </span>
                    </Td>
                    <Td className="text-sm text-gray-500">{c.program?.title || '-'}</Td>
                    <Td>{c._count?.recipients || 0}</Td>
                    <Td><Badge variant={statusVariant[c.status]}>{statusLabel[c.status]}</Badge></Td>
                    <Td className="text-sm text-gray-500">{formatDateTime(c.sentAt || c.createdAt)}</Td>
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
