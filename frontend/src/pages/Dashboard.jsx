import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getDashboardStats, getSLAConfig, updateSLAConfig, sendSLANotifications } from '../api'
import { getAuth } from '../api'
import { PIPELINES, CATEGORY_COLORS } from '../pipelines'
import {
  FolderOpenIcon, CurrencyEuroIcon, ClockIcon, ExclamationTriangleIcon,
  ClipboardDocumentListIcon, UserGroupIcon, Cog6ToothIcon, ChevronDownIcon, ChevronRightIcon,
  BellIcon, PencilIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const fmt = (n) =>
  new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 }).format(n || 0)

function StatCard({ icon: Icon, label, value, sub, colorClass = 'bg-blue-50 text-blue-600' }) {
  return (
    <div className="bg-white rounded-xl border p-4 flex items-start gap-3">
      <div className={`p-2.5 rounded-xl ${colorClass}`}><Icon className="w-5 h-5" /></div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-xl font-bold text-gray-900 mt-0.5">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

const PROG_COLORS = {
  ΕΣΠΑ: 'bg-blue-100 text-blue-800',
  ΔΥΠΑ: 'bg-green-100 text-green-800',
  ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ: 'bg-purple-100 text-purple-800',
}

function SLAConfigPanel({ onClose }) {
  const [tab, setTab] = useState('days') // 'days' | 'messages'
  const [config, setConfig] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    getSLAConfig().then(data => {
      const existing = new Map(data.map(r => [r.status, { sla_days: r.sla_days, notification_message: r.notification_message || '' }]))
      const allStatuses = []
      for (const prog of Object.values(PIPELINES)) {
        for (const phase of prog.phases) {
          for (const s of phase.statuses) {
            if (!allStatuses.find(x => x.status === s))
              allStatuses.push({ status: s, sla_days: existing.get(s)?.sla_days ?? null, notification_message: existing.get(s)?.notification_message ?? '' })
          }
        }
      }
      setConfig(allStatuses)
    }).catch(() => toast.error('Σφάλμα φόρτωσης SLA')).finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const entries = config
        .filter(r => r.sla_days !== null && r.sla_days > 0)
        .map(r => ({ status: r.status, sla_days: r.sla_days, notification_message: r.notification_message || null }))
      await updateSLAConfig(entries)
      toast.success('SLA αποθηκεύτηκαν')
      onClose()
    } catch { toast.error('Σφάλμα αποθήκευσης') }
    finally { setSaving(false) }
  }

  const updateDays = (status, days) => setConfig(prev => prev.map(r => r.status === status ? { ...r, sla_days: days === '' ? null : parseInt(days) } : r))
  const updateMsg = (status, msg) => setConfig(prev => prev.map(r => r.status === status ? { ...r, notification_message: msg } : r))
  const filtered = config.filter(r => !search || r.status.toLowerCase().includes(search.toLowerCase()))
  const withDays = config.filter(r => r.sla_days > 0)

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="p-5 border-b flex items-center justify-between">
          <h2 className="text-lg font-bold">Ρύθμιση SLA</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>
        <div className="flex border-b">
          {[['days', 'Ημέρες ανά Κατάσταση'], ['messages', `Μηνύματα (${withDays.length} καταστάσεις)`]].map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${tab === t ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            >{label}</button>
          ))}
        </div>
        {tab === 'days' && (
          <>
            <div className="p-4 border-b">
              <input className="input text-sm" placeholder="Αναζήτηση κατάστασης..." value={search} onChange={e => setSearch(e.target.value)} />
              <p className="text-xs text-gray-400 mt-1">Αφήστε κενό για να μην ισχύει SLA.</p>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {loading ? <div className="text-center py-8 text-gray-400">Φόρτωση...</div> : (
                <div className="space-y-1">
                  {filtered.map(row => (
                    <div key={row.status} className="flex items-center gap-3 py-1.5 border-b border-gray-50">
                      <span className="flex-1 text-sm text-gray-700 truncate" title={row.status}>{row.status}</span>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <input type="number" min="0" max="365" value={row.sla_days ?? ''} onChange={e => updateDays(row.status, e.target.value)}
                          placeholder="—" className="w-16 text-sm border border-gray-200 rounded px-2 py-1 text-center focus:outline-none focus:ring-1 focus:ring-blue-400" />
                        <span className="text-xs text-gray-400">ημ.</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
        {tab === 'messages' && (
          <div className="flex-1 overflow-y-auto p-4">
            {withDays.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">Ορίστε πρώτα ημέρες SLA για κάποια κατάσταση</div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-gray-500">Αυτά τα μηνύματα θα σταλούν αυτόματα στους πελάτες που καθυστερούν. Χρησιμοποιήστε <code className="bg-gray-100 px-1 rounded">{'{client_name}'}</code> <code className="bg-gray-100 px-1 rounded">{'{service_type}'}</code> <code className="bg-gray-100 px-1 rounded">{'{days_overdue}'}</code></p>
                {withDays.map(row => (
                  <div key={row.status} className="border border-gray-200 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-800 flex-1 truncate" title={row.status}>{row.status}</span>
                      <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">SLA: {row.sla_days} ημ.</span>
                    </div>
                    <textarea
                      className="input text-sm w-full"
                      rows={3}
                      placeholder="Γράψτε εδώ τι χρειάζεται από τον πελάτη... π.χ. 'Αγαπητέ {client_name}, παρακαλούμε να μας αποστείλετε τα παρακάτω δικαιολογητικά...'"
                      value={row.notification_message || ''}
                      onChange={e => updateMsg(row.status, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="p-4 border-t flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">Άκυρο</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">{saving ? 'Αποθήκευση...' : 'Αποθήκευση'}</button>
        </div>
      </div>
    </div>
  )
}

function SLAActionCenter({ slaOverdue, onRefresh }) {
  const [sending, setSending] = useState({})
  const [notifType, setNotifType] = useState('email')

  // Group by status
  const groups = {}
  for (const item of slaOverdue) {
    if (!groups[item.status]) {
      groups[item.status] = { status: item.status, sla_days: item.sla_days, notification_message: item.notification_message, cases: [] }
    }
    groups[item.status].cases.push(item)
  }
  const statusGroups = Object.values(groups).sort((a, b) => b.cases.length - a.cases.length)

  const handleSend = async (status) => {
    setSending(prev => ({ ...prev, [status]: true }))
    try {
      const res = await sendSLANotifications({ status, notification_type: notifType })
      if (res.sent > 0) toast.success(`✓ Εστάλη σε ${res.sent} πελάτες (${status})`)
      if (res.failed > 0) toast.error(`✗ Αποτυχία σε ${res.failed}. Έλεγξε SMTP/Viber.`)
      if (res.sent === 0 && res.failed === 0) toast.error('Δεν βρέθηκαν email/τηλέφωνα για αποστολή')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Σφάλμα αποστολής')
    } finally {
      setSending(prev => ({ ...prev, [status]: false }))
    }
  }

  if (statusGroups.length === 0) return (
    <div className="text-center py-8 text-sm text-gray-400">Δεν υπάρχουν εκπρόθεσμες υποθέσεις με ρυθμισμένο SLA</div>
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-5 py-3 border-b bg-gray-50">
        <span className="text-xs text-gray-600 font-medium">Τύπος αποστολής:</span>
        {[['email', 'Email'], ['viber', 'Viber'], ['both', 'Και τα δύο']].map(([val, label]) => (
          <button key={val} onClick={() => setNotifType(val)}
            className={`text-xs px-3 py-1 rounded-full border font-medium transition-colors ${notifType === val ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300'}`}
          >{label}</button>
        ))}
      </div>
      <div className="divide-y">
        {statusGroups.map(group => (
          <div key={group.status} className="px-5 py-4">
            <div className="flex items-start justify-between gap-4 mb-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-gray-900 truncate">{group.status}</span>
                  <span className="text-xs bg-red-100 text-red-700 font-bold px-1.5 py-0.5 rounded-full">{group.cases.length} εκπρόθεσμες</span>
                  <span className="text-xs text-gray-400">SLA: {group.sla_days} ημ.</span>
                </div>
                {group.notification_message ? (
                  <p className="text-xs text-gray-500 mt-1 italic line-clamp-2">{group.notification_message.substring(0, 120)}{group.notification_message.length > 120 ? '...' : ''}</p>
                ) : (
                  <p className="text-xs text-orange-500 mt-1">⚠ Δεν έχει ρυθμιστεί μήνυμα → Ρυθμίσεις SLA → Μηνύματα</p>
                )}
              </div>
              <button
                onClick={() => handleSend(group.status)}
                disabled={!group.notification_message || sending[group.status]}
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <BellIcon className="w-3.5 h-3.5" />
                {sending[group.status] ? 'Αποστολή...' : `Αποστολή σε ${group.cases.length}`}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {group.cases.slice(0, 6).map(c => (
                <Link key={c.id} to={`/cases/${c.id}`} className="text-xs bg-gray-100 hover:bg-red-50 text-gray-600 px-2 py-0.5 rounded transition-colors">
                  {c.client_name} <span className="text-red-500 font-medium">+{c.overdue_days}ημ</span>
                </Link>
              ))}
              {group.cases.length > 6 && <span className="text-xs text-gray-400">+{group.cases.length - 6} ακόμα</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showSLA, setShowSLA] = useState(false)
  const [expandedProgram, setExpandedProgram] = useState(null)
  const navigate = useNavigate()

  const auth = getAuth()
  useEffect(() => {
    if (!auth || auth.role !== 'admin') {
      navigate('/')
    }
  }, [])

  useEffect(() => {
    getDashboardStats()
      .then(setStats)
      .catch(err => {
        if (err.response?.status === 403) navigate('/')
        else toast.error('Σφάλμα φόρτωσης dashboard')
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
    </div>
  )
  if (!stats) return null

  const s = stats.summary
  const paidPct = s.total_agreed > 0 ? Math.round((s.total_paid / s.total_agreed) * 100) : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">Επισκόπηση · Μόνο Admin</p>
        </div>
        <button onClick={() => setShowSLA(true)} className="flex items-center gap-2 text-sm bg-white border border-gray-200 hover:border-gray-300 px-3 py-1.5 rounded-lg transition-colors">
          <Cog6ToothIcon className="w-4 h-4 text-gray-500" /> Ρυθμίσεις SLA
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={FolderOpenIcon} label="Ενεργές Υποθέσεις" value={s.total_active} colorClass="bg-blue-50 text-blue-600" />
        <StatCard icon={CurrencyEuroIcon} label="Συνολικές Απαιτήσεις" value={fmt(s.total_agreed)} sub={`Εισπράχθηκαν ${fmt(s.total_paid)} (${paidPct}%)`} colorClass="bg-green-50 text-green-600" />
        <StatCard icon={CurrencyEuroIcon} label="Εκκρεμείς Οφειλές" value={fmt(s.total_balance)} colorClass="bg-orange-50 text-orange-600" />
        <StatCard icon={ClockIcon} label="Προθεσμίες 15 ημ." value={s.deadlines_15} sub={`${s.deadlines_30} εντός 30 ημ.`} colorClass={s.deadlines_15 > 0 ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-600'} />
      </div>

      {/* By Program */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-5 py-3 border-b bg-gray-50">
          <h2 className="font-semibold text-gray-800 text-sm">Ανά Pipeline</h2>
        </div>
        <div className="divide-y">
          {stats.by_program.map(row => {
            const isOpen = expandedProgram === row.program_category
            const svcRows = stats.by_service_type.filter(s => s.program_category === row.program_category)
            return (
              <div key={row.program_category}>
                <button
                  onClick={() => setExpandedProgram(isOpen ? null : row.program_category)}
                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 text-left transition-colors"
                >
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PROG_COLORS[row.program_category] || 'bg-gray-100 text-gray-700'}`}>{row.program_category}</span>
                  <span className="text-sm font-medium text-gray-700 flex-1">{row.count} υποθέσεις</span>
                  <span className="text-sm text-gray-500">{fmt(row.total_agreed)}</span>
                  <span className="text-sm font-semibold text-green-700">{fmt(row.total_paid)}</span>
                  <span className="text-sm font-semibold text-orange-600">{fmt(row.total_balance)}</span>
                  {isOpen ? <ChevronDownIcon className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronRightIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                </button>
                {isOpen && svcRows.length > 0 && (
                  <div className="bg-gray-50 border-t">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-400 uppercase tracking-wider">
                          <th className="text-left px-8 py-2 font-semibold">Είδος Υπηρεσίας</th>
                          <th className="text-center px-4 py-2 font-semibold">Υποθέσεις</th>
                          <th className="text-right px-4 py-2 font-semibold">Συμφωνηθέν</th>
                          <th className="text-right px-4 py-2 font-semibold">Εισπράχθηκε</th>
                          <th className="text-right px-8 py-2 font-semibold">Υπόλοιπο</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {svcRows.map(sv => (
                          <tr key={sv.service_type} className="hover:bg-white">
                            <td className="px-8 py-2 text-gray-700">{sv.service_type}</td>
                            <td className="px-4 py-2 text-center font-medium">{sv.count}</td>
                            <td className="px-4 py-2 text-right text-gray-600">{fmt(sv.total_agreed)}</td>
                            <td className="px-4 py-2 text-right text-green-700 font-medium">{fmt(sv.total_paid)}</td>
                            <td className="px-8 py-2 text-right text-orange-600 font-semibold">{fmt(sv.total_balance)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* SLA Overdue + Agents */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SLA Overdue */}
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-5 py-3 border-b bg-gray-50 flex items-center justify-between">
            <h2 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
              <ExclamationTriangleIcon className="w-4 h-4 text-red-500" />
              Εκπρόθεσμες κατά SLA
              {stats.sla_overdue.length > 0 && <span className="bg-red-100 text-red-700 text-xs font-bold px-1.5 py-0.5 rounded-full">{stats.sla_overdue.length}</span>}
            </h2>
          </div>
          {stats.sla_overdue.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-400">Δεν υπάρχουν εκπρόθεσμες υποθέσεις</div>
          ) : (
            <div className="divide-y max-h-52 overflow-y-auto">
              {stats.sla_overdue.slice(0, 10).map(item => (
                <Link key={item.id} to={`/cases/${item.id}`} className="flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{item.client_name}</div>
                    <div className="text-xs text-gray-500 truncate">{item.status}</div>
                  </div>
                  <span className="flex-shrink-0 text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">+{item.overdue_days} ημ.</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Agents workload */}
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-5 py-3 border-b bg-gray-50">
            <h2 className="font-semibold text-gray-800 text-sm flex items-center gap-2"><UserGroupIcon className="w-4 h-4 text-blue-500" />Φόρτος Agents</h2>
          </div>
          <div className="divide-y">
            {stats.agents_workload.map(a => (
              <div key={a.agent_name} className="flex items-center gap-3 px-5 py-2.5">
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-800">{a.agent_name}</div>
                  <div className="text-xs text-gray-400">{a.case_count} υποθέσεις</div>
                </div>
                {a.total_balance > 0 && <span className="text-xs font-semibold text-orange-600">{fmt(a.total_balance)}</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Urgent deadlines + Recent */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-5 py-3 border-b bg-gray-50"><h2 className="font-semibold text-gray-800 text-sm flex items-center gap-2"><ClockIcon className="w-4 h-4 text-orange-500" />Επείγουσες Προθεσμίες (15 ημ.)</h2></div>
          {stats.urgent_cases.length === 0 ? <div className="text-center py-8 text-sm text-gray-400">Καμία επείγουσα προθεσμία</div> : (
            <div className="divide-y max-h-64 overflow-y-auto">
              {stats.urgent_cases.map(c => (
                <Link key={c.id} to={`/cases/${c.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{c.client_name}</div>
                    <div className="text-xs text-gray-500 truncate">{c.status}</div>
                  </div>
                  <span className={`flex-shrink-0 text-xs font-bold px-1.5 py-0.5 rounded ${c.days_to_deadline <= 7 ? 'text-red-600 bg-red-50 border border-red-200' : 'text-orange-600 bg-orange-50 border border-orange-200'}`}>{c.days_to_deadline} ημ.</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-5 py-3 border-b bg-gray-50"><h2 className="font-semibold text-gray-800 text-sm">Πρόσφατη Δραστηριότητα</h2></div>
          <div className="divide-y max-h-64 overflow-y-auto">
            {stats.recent_cases.map(c => (
              <Link key={c.id} to={`/cases/${c.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{c.client_name}</div>
                  <div className="text-xs text-gray-500 truncate">{c.status}</div>
                </div>
                {c.assigned_agent_name && <span className="text-xs text-gray-400 flex-shrink-0">{c.assigned_agent_name}</span>}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* SLA Action Center */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-5 py-3 border-b bg-gray-50 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
            <BellIcon className="w-4 h-4 text-blue-500" />
            Κέντρο SLA Δράσης — Αποστολή Ειδοποιήσεων
          </h2>
          <button onClick={() => setShowSLA(true)} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
            <Cog6ToothIcon className="w-3.5 h-3.5" /> Ρύθμιση μηνυμάτων
          </button>
        </div>
        <SLAActionCenter slaOverdue={stats.sla_overdue} />
      </div>

      {showSLA && <SLAConfigPanel onClose={() => setShowSLA(false)} />}
    </div>
  )
}
