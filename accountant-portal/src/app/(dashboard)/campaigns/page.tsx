'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/table'
import { Plus, Mail, MessageCircle } from 'lucide-react'
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Καμπάνιες</h1>
          <p className="text-gray-500 mt-1">{campaigns.length} καμπάνιες</p>
        </div>
        <Link href="/campaigns/new">
          <Button><Plus size={16} className="mr-2" />Νέα Καμπάνια</Button>
        </Link>
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
