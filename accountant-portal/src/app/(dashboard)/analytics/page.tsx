'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import { TrendingUp, Building2, Clock, ArrowUpDown } from 'lucide-react'

type AccountantStat = {
  id: string
  officeName: string
  contactPerson: string
  email: string
  active: boolean
  totalBusinesses: number
  lastAdded: string | null
  lastEdited: string | null
  recentlyAdded: number
  recentlyEdited: number
  monthly: Record<string, number>
}

function fmt(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtMonthLabel(key: string) {
  const [y, m] = key.split('-')
  return new Date(Number(y), Number(m) - 1).toLocaleDateString('el-GR', { month: 'short', year: '2-digit' })
}

type SortKey = 'officeName' | 'totalBusinesses' | 'lastAdded' | 'recentlyAdded'

export default function AnalyticsPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [data, setData] = useState<{ accountants: AccountantStat[]; labels: string[] } | null>(null)
  const [months, setMonths] = useState(6)
  const [sortKey, setSortKey] = useState<SortKey>('totalBusinesses')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    if (session && session.user.role !== 'ADMIN') router.replace('/dashboard')
  }, [session])

  useEffect(() => {
    setData(null)
    fetch(`/api/analytics/businesses?months=${months}`)
      .then(r => r.json())
      .then(setData)
  }, [months])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const sorted = data ? [...data.accountants].sort((a, b) => {
    let av: any, bv: any
    if (sortKey === 'lastAdded') {
      av = a.lastAdded ? new Date(a.lastAdded).getTime() : 0
      bv = b.lastAdded ? new Date(b.lastAdded).getTime() : 0
    } else {
      av = a[sortKey]; bv = b[sortKey]
    }
    if (av < bv) return sortDir === 'asc' ? -1 : 1
    if (av > bv) return sortDir === 'asc' ? 1 : -1
    return 0
  }) : []

  // Build chart data: one bar per month, stacked by accountant (top 5 by total)
  const top5 = data
    ? [...data.accountants].sort((a, b) => b.totalBusinesses - a.totalBusinesses).slice(0, 5)
    : []

  const chartData = data?.labels.map(label => {
    const entry: Record<string, any> = { month: fmtMonthLabel(label) }
    for (const acc of top5) entry[acc.officeName] = acc.monthly[label] || 0
    return entry
  }) ?? []

  const COLORS = ['#4f46e5', '#06b6d4', '#10b981', '#f59e0b', '#ef4444']

  const totalBusinesses = data?.accountants.reduce((s, a) => s + a.totalBusinesses, 0) ?? 0
  const activeThisMonth = data?.accountants.filter(a => a.recentlyAdded > 0 || a.recentlyEdited > 0).length ?? 0
  const addedThisMonth = data?.accountants.reduce((s, a) => s + a.recentlyAdded, 0) ?? 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Αναλυτικά Στοιχεία</h1>
          <p className="text-gray-500 mt-1">Δραστηριότητα λογιστικών γραφείων — προσθήκες & επεξεργασίες επιχειρήσεων</p>
        </div>
        <select
          value={months}
          onChange={e => setMonths(Number(e.target.value))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value={3}>Τελευταίοι 3 μήνες</option>
          <option value={6}>Τελευταίοι 6 μήνες</option>
          <option value={12}>Τελευταίοι 12 μήνες</option>
          <option value={24}>Τελευταία 2 χρόνια</option>
        </select>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-indigo-50"><Building2 size={20} className="text-indigo-600" /></div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{totalBusinesses}</p>
              <p className="text-xs text-gray-500">Σύνολο επιχειρήσεων</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-green-50"><TrendingUp size={20} className="text-green-600" /></div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{addedThisMonth}</p>
              <p className="text-xs text-gray-500">Νέες επιχειρήσεις (30 ημέρες)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-amber-50"><Clock size={20} className="text-amber-600" /></div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{activeThisMonth}</p>
              <p className="text-xs text-gray-500">Ενεργά γραφεία (30 ημέρες)</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bar chart */}
      {chartData.length > 0 && top5.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Νέες Επιχειρήσεις ανά Μήνα (Top 5 γραφεία)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {top5.map((acc, i) => (
                  <Bar key={acc.id} dataKey={acc.officeName} stackId="a" fill={COLORS[i % COLORS.length]} radius={i === top5.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Per-accountant table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ανά Λογιστικό Γραφείο</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!data ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin w-7 h-7 border-4 border-indigo-600 border-t-transparent rounded-full" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {([
                      ['officeName', 'Γραφείο'],
                      ['totalBusinesses', 'Επιχειρήσεις'],
                      ['recentlyAdded', 'Νέες (30η)'],
                      ['lastAdded', 'Τελευταία Προσθήκη'],
                    ] as [SortKey, string][]).map(([key, label]) => (
                      <th key={key}
                        onClick={() => toggleSort(key)}
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase cursor-pointer hover:text-gray-800 select-none whitespace-nowrap"
                      >
                        <span className="flex items-center gap-1">
                          {label}
                          <ArrowUpDown size={11} className={sortKey === key ? 'text-indigo-500' : 'text-gray-300'} />
                        </span>
                      </th>
                    ))}
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Τελευταία Επεξεργασία</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Κατάσταση</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((acc, i) => (
                    <tr key={acc.id} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{acc.officeName}</div>
                        <div className="text-xs text-gray-400">{acc.contactPerson}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-bold text-indigo-700">{acc.totalBusinesses}</span>
                      </td>
                      <td className="px-4 py-3">
                        {acc.recentlyAdded > 0
                          ? <span className="inline-flex items-center gap-1 text-green-700 font-semibold">+{acc.recentlyAdded}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmt(acc.lastAdded)}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmt(acc.lastEdited)}</td>
                      <td className="px-4 py-3">
                        <Badge variant={acc.active ? 'success' : 'secondary'}>
                          {acc.active ? 'Ενεργός' : 'Ανενεργός'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {sorted.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-8 text-gray-400">Δεν βρέθηκαν δεδομένα</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
