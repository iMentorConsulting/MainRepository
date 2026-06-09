'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Mail, MessageCircle, Send, AlertTriangle, Eye, MousePointerClick } from 'lucide-react'

const channelLabel: Record<string, string> = { EMAIL: 'Email', VIBER: 'Viber' }

function StatCard({ icon, label, value, color }: { icon: React.ReactNode, label: string, value: number, color: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-5">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>{icon}</div>
        <div>
          <div className="text-2xl font-bold text-gray-900">{value}</div>
          <div className="text-xs text-gray-500">{label}</div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function CampaignAnalyticsPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/campaigns/analytics')
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-blue-800 border-t-transparent rounded-full" />
    </div>
  )
  if (!data) return <div className="text-center text-gray-500">Σφάλμα φόρτωσης analytics</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/campaigns">
          <Button variant="ghost" size="sm"><ArrowLeft size={16} className="mr-1" />Πίσω</Button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Συνολικά Analytics Μηνυμάτων</h1>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard icon={<Send size={18} className="text-white" />} label="Σύνολο Μηνυμάτων" value={data.total} color="bg-slate-700" />
        <StatCard icon={<Send size={18} className="text-white" />} label="Εστάλησαν" value={data.sent} color="bg-emerald-600" />
        <StatCard icon={<AlertTriangle size={18} className="text-white" />} label="Απέτυχαν" value={data.failed} color="bg-red-600" />
        <StatCard icon={<Eye size={18} className="text-white" />} label="Ανοίχτηκαν" value={data.opened} color="bg-blue-600" />
        <StatCard icon={<MousePointerClick size={18} className="text-white" />} label="Κλικ" value={data.clicked} color="bg-violet-600" />
      </div>

      <Card>
        <CardHeader><CardTitle>Ανά Κανάλι</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {data.byChannel.map((c: any) => (
              <div key={c.channel} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50">
                {c.channel === 'EMAIL' ? <Mail size={16} className="text-blue-700" /> : <MessageCircle size={16} className="text-violet-700" />}
                <span className="text-sm font-medium text-gray-700">{channelLabel[c.channel] || c.channel}</span>
                <Badge variant="secondary">{c.count}</Badge>
              </div>
            ))}
            {data.byChannel.length === 0 && <span className="text-sm text-gray-400">Δεν υπάρχουν δεδομένα</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Κορυφαίες Καμπάνιες (κατά αριθμό παραληπτών)</CardTitle></CardHeader>
        <CardContent>
          {data.topCampaigns.length === 0 ? (
            <span className="text-sm text-gray-400">Δεν υπάρχουν δεδομένα</span>
          ) : (
            <ul className="divide-y divide-gray-100">
              {data.topCampaigns.map((tc: any) => (
                <li key={tc.campaign.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <Link href={`/campaigns/${tc.campaign.id}`} className="font-medium text-blue-700 hover:underline truncate">
                    {tc.campaign.title}
                  </Link>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="secondary">{channelLabel[tc.campaign.channel] || tc.campaign.channel}</Badge>
                    <Badge variant="info">{tc.recipients} παραλήπτες</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
