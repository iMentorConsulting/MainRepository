'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, LabelList,
} from 'recharts'
import { TrendingUp, Building2, Clock, ArrowUpDown, LogIn, Trophy, Star, Send } from 'lucide-react'

// ── shared helpers ────────────────────────────────────────────────────────────
function fmt(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function fmtMonthLabel(key: string) {
  const [y, m] = key.split('-')
  return new Date(Number(y), Number(m) - 1).toLocaleDateString('el-GR', { month: 'short', year: '2-digit' })
}

const LEVELS = [
  { min: 0,   label: 'Αρχάριος',       emoji: '🌱', color: 'text-gray-500',   bar: '#9ca3af' },
  { min: 50,  label: 'Αναπτυσσόμενος', emoji: '🚀', color: 'text-blue-600',   bar: '#3b82f6' },
  { min: 150, label: 'Ενεργός',         emoji: '⚡', color: 'text-indigo-600', bar: '#6366f1' },
  { min: 350, label: 'Εξπέρ',           emoji: '🎯', color: 'text-purple-600', bar: '#a855f7' },
  { min: 700, label: 'Πρωταθλητής',     emoji: '🏆', color: 'text-amber-500',  bar: '#f59e0b' },
]
function getLevel(score: number) {
  return [...LEVELS].reverse().find(l => score >= l.min) ?? LEVELS[0]
}

// ── Tab: Επιχειρήσεις (existing) ─────────────────────────────────────────────
type AccountantStat = {
  id: string; officeName: string; contactPerson: string; email: string; active: boolean
  totalBusinesses: number; lastAdded: string | null; lastEdited: string | null
  recentlyAdded: number; recentlyEdited: number; monthly: Record<string, number>
}
type SortKey = 'officeName' | 'totalBusinesses' | 'lastAdded' | 'recentlyAdded'

function TabBusinesses() {
  const [data, setData] = useState<{ accountants: AccountantStat[]; labels: string[] } | null>(null)
  const [months, setMonths] = useState(6)
  const [sortKey, setSortKey] = useState<SortKey>('totalBusinesses')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    setData(null)
    fetch(`/api/analytics/businesses?months=${months}`).then(r => r.json()).then(setData)
  }, [months])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const sorted = data ? [...data.accountants].sort((a, b) => {
    let av: any = sortKey === 'lastAdded' ? (a.lastAdded ? new Date(a.lastAdded).getTime() : 0) : a[sortKey]
    let bv: any = sortKey === 'lastAdded' ? (b.lastAdded ? new Date(b.lastAdded).getTime() : 0) : b[sortKey]
    return sortDir === 'asc' ? (av < bv ? -1 : av > bv ? 1 : 0) : (av > bv ? -1 : av < bv ? 1 : 0)
  }) : []

  const top5 = data ? [...data.accountants].sort((a, b) => b.totalBusinesses - a.totalBusinesses).slice(0, 5) : []
  const chartData = data?.labels.map(label => {
    const entry: Record<string, any> = { month: fmtMonthLabel(label) }
    let total = 0
    for (const acc of top5) {
      const v = acc.monthly[label] || 0
      entry[acc.officeName] = v
      total += v
    }
    entry._total = total
    return entry
  }) ?? []
  const COLORS = ['#4f46e5', '#06b6d4', '#10b981', '#f59e0b', '#ef4444']
  const totalBusinesses = data?.accountants.reduce((s, a) => s + a.totalBusinesses, 0) ?? 0
  const activeThisMonth = data?.accountants.filter(a => a.recentlyAdded > 0 || a.recentlyEdited > 0).length ?? 0
  const addedThisMonth  = data?.accountants.reduce((s, a) => s + a.recentlyAdded, 0) ?? 0

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <select value={months} onChange={e => setMonths(Number(e.target.value))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value={3}>Τελευταίοι 3 μήνες</option>
          <option value={6}>Τελευταίοι 6 μήνες</option>
          <option value={12}>Τελευταίοι 12 μήνες</option>
          <option value={24}>Τελευταία 2 χρόνια</option>
        </select>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><CardContent className="pt-5 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-indigo-50"><Building2 size={20} className="text-indigo-600" /></div>
          <div><p className="text-2xl font-bold text-gray-900">{totalBusinesses}</p><p className="text-xs text-gray-500">Σύνολο επιχειρήσεων</p></div>
        </CardContent></Card>
        <Card><CardContent className="pt-5 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-green-50"><TrendingUp size={20} className="text-green-600" /></div>
          <div><p className="text-2xl font-bold text-gray-900">{addedThisMonth}</p><p className="text-xs text-gray-500">Νέες επιχειρήσεις (30 ημέρες)</p></div>
        </CardContent></Card>
        <Card><CardContent className="pt-5 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-amber-50"><Clock size={20} className="text-amber-600" /></div>
          <div><p className="text-2xl font-bold text-gray-900">{activeThisMonth}</p><p className="text-xs text-gray-500">Ενεργά γραφεία (30 ημέρες)</p></div>
        </CardContent></Card>
      </div>
      {chartData.length > 0 && top5.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Νέες Επιχειρήσεις ανά Μήνα (Top 5 γραφεία)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ top: 24, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} domain={[0, (max: number) => Math.ceil(max * 1.15)]} />
                <Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} />
                {top5.map((acc, i) => (
                  <Bar key={acc.id} dataKey={acc.officeName} stackId="a" fill={COLORS[i % COLORS.length]} radius={i === top5.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}>
                    {i === top5.length - 1 && (
                      <LabelList dataKey="_total" position="top" style={{ fontSize: 11, fill: '#475569' }} />
                    )}
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle className="text-base">Ανά Λογιστικό Γραφείο</CardTitle></CardHeader>
        <CardContent className="p-0">
          {!data ? (
            <div className="flex items-center justify-center h-32"><div className="animate-spin w-7 h-7 border-4 border-indigo-600 border-t-transparent rounded-full" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {(['officeName','totalBusinesses','recentlyAdded','lastAdded'] as SortKey[]).map((key) => (
                      <th key={key} onClick={() => toggleSort(key)}
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase cursor-pointer hover:text-gray-800 select-none whitespace-nowrap">
                        <span className="flex items-center gap-1">
                          {key === 'officeName' ? 'Γραφείο' : key === 'totalBusinesses' ? 'Επιχειρήσεις' : key === 'recentlyAdded' ? 'Νέες (30η)' : 'Τελ. Προσθήκη'}
                          <ArrowUpDown size={11} className={sortKey === key ? 'text-indigo-500' : 'text-gray-300'} />
                        </span>
                      </th>
                    ))}
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Τελ. Επεξεργασία</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Κατάσταση</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((acc, i) => (
                    <tr key={acc.id} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${i % 2 ? 'bg-gray-50/50' : ''}`}>
                      <td className="px-4 py-3"><div className="font-medium text-gray-900">{acc.officeName}</div><div className="text-xs text-gray-400">{acc.contactPerson}</div></td>
                      <td className="px-4 py-3"><span className="font-bold text-indigo-700">{acc.totalBusinesses}</span></td>
                      <td className="px-4 py-3">{acc.recentlyAdded > 0 ? <span className="text-green-700 font-semibold">+{acc.recentlyAdded}</span> : <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmt(acc.lastAdded)}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmt(acc.lastEdited)}</td>
                      <td className="px-4 py-3"><Badge variant={acc.active ? 'success' : 'secondary'}>{acc.active ? 'Ενεργός' : 'Ανενεργός'}</Badge></td>
                    </tr>
                  ))}
                  {sorted.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-gray-400">Δεν βρέθηκαν δεδομένα</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Tab: Logins ───────────────────────────────────────────────────────────────
function TabLogins() {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/analytics/logins').then(r => r.json()).then(d => { setData(Array.isArray(d) ? d : []); setLoading(false) })
  }, [])

  const sorted = [...data].sort((a, b) => {
    if (!a.lastLoginAt && !b.lastLoginAt) return 0
    if (!a.lastLoginAt) return 1
    if (!b.lastLoginAt) return -1
    return new Date(b.lastLoginAt).getTime() - new Date(a.lastLoginAt).getTime()
  })

  const neverLoggedIn = data.filter(a => !a.lastLoginAt).length
  const active7d = data.filter(a => a.lastLoginAt && (Date.now() - new Date(a.lastLoginAt).getTime()) < 7 * 86400000).length

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><CardContent className="pt-5 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-indigo-50"><LogIn size={20} className="text-indigo-600" /></div>
          <div><p className="text-2xl font-bold text-gray-900">{active7d}</p><p className="text-xs text-gray-500">Σύνδεση τελ. 7 ημέρες</p></div>
        </CardContent></Card>
        <Card><CardContent className="pt-5 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-amber-50"><Clock size={20} className="text-amber-600" /></div>
          <div><p className="text-2xl font-bold text-gray-900">{neverLoggedIn}</p><p className="text-xs text-gray-500">Ποτέ δεν συνδέθηκαν</p></div>
        </CardContent></Card>
        <Card><CardContent className="pt-5 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-green-50"><Building2 size={20} className="text-green-600" /></div>
          <div><p className="text-2xl font-bold text-gray-900">{data.length}</p><p className="text-xs text-gray-500">Σύνολο γραφείων</p></div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Τελευταία Σύνδεση ανά Γραφείο</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-32"><div className="animate-spin w-7 h-7 border-4 border-indigo-600 border-t-transparent rounded-full" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase font-semibold">
                    <th className="px-4 py-3 text-left">Γραφείο</th>
                    <th className="px-4 py-3 text-left">Χρήστης</th>
                    <th className="px-4 py-3 text-left">Τελευταία Σύνδεση</th>
                    <th className="px-4 py-3 text-right">Συνδέσεις (30η)</th>
                    <th className="px-4 py-3 text-left">Κατάσταση</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((acc, i) => {
                    const daysSince = acc.lastLoginAt
                      ? Math.floor((Date.now() - new Date(acc.lastLoginAt).getTime()) / 86400000)
                      : null
                    const freshness = daysSince === null ? 'none'
                      : daysSince <= 3 ? 'hot'
                      : daysSince <= 14 ? 'warm'
                      : 'cold'
                    return (
                      <tr key={acc.id} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${i % 2 ? 'bg-gray-50/40' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{acc.officeName}</div>
                          <div className="text-xs text-gray-400">{acc.contactPerson}</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">{acc.userEmail || '—'}</td>
                        <td className="px-4 py-3">
                          {acc.lastLoginAt ? (
                            <div>
                              <div className="text-gray-700 text-xs">{fmt(acc.lastLoginAt)}</div>
                              <div className={`text-xs mt-0.5 ${freshness === 'hot' ? 'text-green-600' : freshness === 'warm' ? 'text-amber-600' : 'text-red-500'}`}>
                                {daysSince === 0 ? 'Σήμερα' : daysSince === 1 ? 'Χτες' : `${daysSince} μέρες πριν`}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-300 italic">Ποτέ</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {acc.totalLogins30d > 0
                            ? <span className="font-semibold text-indigo-700">{acc.totalLogins30d}</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3"><Badge variant={acc.active ? 'success' : 'secondary'}>{acc.active ? 'Ενεργός' : 'Ανενεργός'}</Badge></td>
                      </tr>
                    )
                  })}
                  {sorted.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-gray-400">Δεν βρέθηκαν δεδομένα</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Tab: Βαθμολογίες ─────────────────────────────────────────────────────────
function TabScores() {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/analytics/scores').then(r => r.json()).then(d => { setData(Array.isArray(d) ? d : []); setLoading(false) })
  }, [])

  const sorted = [...data].sort((a, b) => b.score.total - a.score.total)
  const avg = data.length > 0 ? Math.round(data.reduce((s, a) => s + a.score.total, 0) / data.length) : 0
  const topScore = data.length > 0 ? Math.max(...data.map(a => a.score.total)) : 0

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><CardContent className="pt-5 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-amber-50"><Trophy size={20} className="text-amber-500" /></div>
          <div><p className="text-2xl font-bold text-gray-900">{topScore}</p><p className="text-xs text-gray-500">Υψηλότερη βαθμολογία</p></div>
        </CardContent></Card>
        <Card><CardContent className="pt-5 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-indigo-50"><Star size={20} className="text-indigo-600" /></div>
          <div><p className="text-2xl font-bold text-gray-900">{avg}</p><p className="text-xs text-gray-500">Μέσος όρος βαθμολογίας</p></div>
        </CardContent></Card>
        <Card><CardContent className="pt-5 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-purple-50"><Send size={20} className="text-purple-600" /></div>
          <div><p className="text-2xl font-bold text-gray-900">{data.filter(a => a.score.total >= 50).length}</p><p className="text-xs text-gray-500">Γραφεία ≥50 πόντοι</p></div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Βαθμολογία ανά Γραφείο</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-32"><div className="animate-spin w-7 h-7 border-4 border-indigo-600 border-t-transparent rounded-full" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase font-semibold">
                    <th className="px-4 py-3 text-left w-6">#</th>
                    <th className="px-4 py-3 text-left">Γραφείο</th>
                    <th className="px-4 py-3 text-center">Πόντοι</th>
                    <th className="px-4 py-3 text-center">Επιχειρήσεις</th>
                    <th className="px-4 py-3 text-center">Με Επικοινωνία</th>
                    <th className="px-4 py-3 text-center">Μηνύματα Καμπ.</th>
                    <th className="px-4 py-3 text-left">Επίπεδο</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((acc, i) => {
                    const lvl = getLevel(acc.score.total)
                    return (
                      <tr key={acc.id} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${i % 2 ? 'bg-gray-50/40' : ''}`}>
                        <td className="px-4 py-3 text-gray-400 font-mono text-xs">{i + 1}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{acc.officeName}</div>
                          <div className="text-xs text-gray-400">{acc.contactPerson}</div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="font-bold text-indigo-700 text-lg">{acc.score.total}</span>
                          <span className="text-gray-400 text-xs ml-1">pts</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="font-semibold text-gray-800">{acc.score.vol}</span>
                          <span className="text-gray-400 text-xs ml-1">pts ({acc.totalBusinesses} επιχ.)</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="font-semibold text-gray-800">{acc.score.dat}</span>
                          <span className="text-gray-400 text-xs ml-1">pts ({acc.contactBiz} επιχ.)</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="font-semibold text-gray-800">{acc.score.camp}</span>
                          <span className="text-gray-400 text-xs ml-1">pts ({acc.campaignRecipients} μην.)</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-sm font-medium ${lvl.color}`}>{lvl.emoji} {lvl.label}</span>
                        </td>
                      </tr>
                    )
                  })}
                  {sorted.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-gray-400">Δεν βρέθηκαν δεδομένα</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'businesses', label: '🏢 Επιχειρήσεις' },
  { id: 'logins',     label: '🔐 Logins' },
  { id: 'scores',     label: '🏆 Βαθμολογίες' },
]

export default function AnalyticsPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [tab, setTab] = useState('businesses')

  useEffect(() => {
    if (session && session.user.role !== 'ADMIN') router.replace('/dashboard')
  }, [session, router])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Αναλυτικά Στοιχεία</h1>
        <p className="text-gray-500 mt-1">Δραστηριότητα λογιστικών γραφείων</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'businesses' && <TabBusinesses />}
      {tab === 'logins'     && <TabLogins />}
      {tab === 'scores'     && <TabScores />}
    </div>
  )
}
