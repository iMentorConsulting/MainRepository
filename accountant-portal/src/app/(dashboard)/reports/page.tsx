'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { Mail, MessageCircle, Trophy, TrendingUp, Send, Star } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

const LEVELS = [
  { min: 0,  max: 24,  label: 'Αρχάριος',       color: 'text-gray-500',   bg: 'bg-gray-100',   emoji: '🌱' },
  { min: 25, max: 49,  label: 'Αναπτυσσόμενος', color: 'text-blue-600',   bg: 'bg-blue-50',    emoji: '🚀' },
  { min: 50, max: 74,  label: 'Ενεργός',         color: 'text-indigo-600', bg: 'bg-indigo-50',  emoji: '⚡' },
  { min: 75, max: 89,  label: 'Εξπέρ',           color: 'text-purple-600', bg: 'bg-purple-50',  emoji: '🎯' },
  { min: 90, max: 100, label: 'Πρωταθλητής',     color: 'text-amber-600',  bg: 'bg-amber-50',   emoji: '🏆' },
]

function getLevel(score: number) {
  return LEVELS.find(l => score >= l.min && score <= l.max) ?? LEVELS[0]
}

function fmtMonth(key: string) {
  const [y, m] = key.split('-')
  return new Date(Number(y), Number(m) - 1).toLocaleDateString('el-GR', { month: 'short', year: '2-digit' })
}

const statusVariant: Record<string, any> = { DRAFT: 'secondary', SCHEDULED: 'warning', SENT: 'success' }
const statusLabel: Record<string, string>  = { DRAFT: 'Πρόχειρο', SCHEDULED: 'Προγρ/νο', SENT: 'Απεστάλη' }

export default function ReportsPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/reports')
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full" />
    </div>
  )

  const score   = data?.score?.total ?? 0
  const level   = getLevel(score)
  const nextLvl = LEVELS.find(l => l.min > score)
  const bd      = data?.score?.breakdown ?? {}
  const growth: any[] = data?.growth ?? []
  const campaigns: any[] = data?.campaigns ?? []

  const growthChart = growth.map(g => ({ ...g, month: fmtMonth(g.month) }))
  const recentAdded = growth.slice(-3).reduce((s: number, g: any) => s + g.added, 0)
  const totalBiz    = growth.length > 0 ? growth[growth.length - 1].total : 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Αναφορές</h1>
        <p className="text-gray-500 mt-1">Ιστορικό δραστηριότητας & βαθμολογία γραφείου</p>
      </div>

      {/* ── Score Card ─────────────────────────────────────────────────── */}
      <div className={`rounded-2xl border-2 p-6 ${level.bg} border-opacity-50`}
        style={{ borderColor: level.bg.replace('bg-', '').replace('-50', '') }}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">

          {/* Big score circle */}
          <div className="flex-shrink-0 relative">
            <div className="w-28 h-28 rounded-full bg-white shadow-md flex flex-col items-center justify-center border-4"
              style={{ borderColor: '#6366f1' }}>
              <span className="text-3xl font-black text-indigo-700">{score}</span>
              <span className="text-xs text-gray-400 font-medium">/ 100</span>
            </div>
            <span className="absolute -top-2 -right-2 text-2xl">{level.emoji}</span>
          </div>

          {/* Level & breakdown */}
          <div className="flex-1 space-y-3">
            <div>
              <span className={`text-xl font-bold ${level.color}`}>{level.label}</span>
              {nextLvl && (
                <span className="ml-2 text-xs text-gray-400">
                  +{nextLvl.min - score} πόντοι για {nextLvl.emoji} {nextLvl.label}
                </span>
              )}
            </div>

            {/* Progress bar */}
            <div className="w-full bg-white/70 rounded-full h-3 overflow-hidden shadow-inner">
              <div
                className="h-3 rounded-full transition-all duration-700"
                style={{ width: `${score}%`, background: 'linear-gradient(90deg,#6366f1,#a855f7)' }}
              />
            </div>

            {/* Breakdown pills */}
            <div className="flex flex-wrap gap-2">
              {Object.entries(bd).map(([key, v]: [string, any]) => (
                <div key={key} className="bg-white/80 rounded-xl px-3 py-1.5 text-xs shadow-sm">
                  <span className="font-semibold text-gray-700">{v.label}</span>
                  <span className="ml-1 text-indigo-600 font-bold">{v.score}/{v.max}</span>
                  <span className="ml-1 text-gray-400">
                    ({key === 'volume' ? `${v.value} επιχ.`
                      : key === 'campaigns' ? `${v.value} καμπ.`
                      : `${v.value}%`})
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Trophy */}
          <div className="hidden lg:flex flex-col items-center gap-1">
            <Trophy size={36} className={level.color} />
            <span className="text-xs text-gray-400 font-medium">Βαθμολογία</span>
          </div>
        </div>

        {/* Tips */}
        <div className="mt-4 pt-4 border-t border-white/50 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          {bd.volume?.score < bd.volume?.max && (
            <div className="bg-white/70 rounded-xl p-3 flex gap-2 items-start">
              <TrendingUp size={14} className="text-indigo-500 flex-shrink-0 mt-0.5" />
              <span className="text-gray-600">Προσθέστε περισσότερες επιχειρήσεις για <strong>+{bd.volume.max - bd.volume.score} πόντους</strong></span>
            </div>
          )}
          {bd.matching?.score < bd.matching?.max && (
            <div className="bg-white/70 rounded-xl p-3 flex gap-2 items-start">
              <Star size={14} className="text-purple-500 flex-shrink-0 mt-0.5" />
              <span className="text-gray-600">Τρέξτε Matching για να βελτιώσετε το <strong>ποσοστό επιλεξιμότητας</strong></span>
            </div>
          )}
          {bd.campaigns?.score < bd.campaigns?.max && (
            <div className="bg-white/70 rounded-xl p-3 flex gap-2 items-start">
              <Send size={14} className="text-green-600 flex-shrink-0 mt-0.5" />
              <span className="text-gray-600">Στείλτε καμπάνιες στους πελάτες σας για <strong>+{bd.campaigns.max - bd.campaigns.score} πόντους</strong></span>
            </div>
          )}
        </div>
      </div>

      {/* ── Business Growth ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-gray-900">Ανάπτυξη Βάσης Πελατών</h2>
            <p className="text-xs text-gray-400 mt-0.5">Πώς μεγαλώνει το χαρτοφυλάκιό σας</p>
          </div>
          <div className="flex gap-3 text-right">
            <div>
              <p className="text-2xl font-black text-indigo-700">{totalBiz}</p>
              <p className="text-xs text-gray-400">Συνολικά</p>
            </div>
            {recentAdded > 0 && (
              <div>
                <p className="text-2xl font-black text-green-600">+{recentAdded}</p>
                <p className="text-xs text-gray-400">Τελ. 3 μήνες</p>
              </div>
            )}
          </div>
        </div>

        {growthChart.length > 1 ? (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={growthChart} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                formatter={(v: any, name: string) => [v, name === 'total' ? 'Σύνολο' : 'Νέες']}
              />
              <Area type="monotone" dataKey="total" stroke="#6366f1" strokeWidth={2.5}
                fill="url(#grad)" name="total" dot={{ r: 3, fill: '#6366f1' }} />
              <Area type="monotone" dataKey="added" stroke="#10b981" strokeWidth={1.5}
                fill="none" name="added" strokeDasharray="4 3" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-40 flex items-center justify-center text-gray-300 text-sm">
            Προσθέστε επιχειρήσεις για να δείτε την ανάπτυξή σας
          </div>
        )}

        {/* Milestone badges */}
        {totalBiz > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {[10, 25, 50, 100, 200].map(n => (
              <span key={n}
                className={`text-xs px-2.5 py-1 rounded-full font-semibold border transition-all ${
                  totalBiz >= n
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-gray-50 text-gray-300 border-gray-200'
                }`}>
                {totalBiz >= n ? '✓' : '🔒'} {n} επιχ.
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Campaign History ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900">Ιστορικό Καμπανιών</h2>
            <p className="text-xs text-gray-400 mt-0.5">Τι έχει σταλεί, πότε και σε ποιους</p>
          </div>
          <Link href="/campaigns/new">
            <button className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors font-medium">
              + Νέα Καμπάνια
            </button>
          </Link>
        </div>

        {campaigns.length === 0 ? (
          <div className="py-16 text-center">
            <Send size={32} className="text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">Δεν έχετε στείλει καμπάνια ακόμη.</p>
            <Link href="/campaigns/new">
              <button className="mt-3 text-sm text-indigo-600 font-medium hover:underline">
                Στείλτε την πρώτη σας τώρα →
              </button>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase font-semibold">
                  <th className="px-6 py-3 text-left">Τίτλος</th>
                  <th className="px-4 py-3 text-left">Κανάλι</th>
                  <th className="px-4 py-3 text-left">Πρόγραμμα</th>
                  <th className="px-4 py-3 text-right">Παραλήπτες</th>
                  <th className="px-4 py-3 text-left">Κατάσταση</th>
                  <th className="px-4 py-3 text-left">Ημερομηνία</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c, i) => (
                  <tr key={c.id} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-50/40'}`}>
                    <td className="px-6 py-3">
                      <Link href={`/campaigns/${c.id}`} className="font-medium text-indigo-700 hover:underline">
                        {c.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5 text-gray-600">
                        {c.channel === 'EMAIL'
                          ? <Mail size={13} className="text-blue-500" />
                          : <MessageCircle size={13} className="text-purple-500" />}
                        {c.channel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{c.program || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      {c.recipients > 0
                        ? <span className="font-semibold text-gray-800">{c.recipients}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusVariant[c.status]}>{statusLabel[c.status]}</Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-400 whitespace-nowrap text-xs">
                      {formatDateTime(c.sentAt || c.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
