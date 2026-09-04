import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import * as api from '../api'
import { fmt } from '../utils/calculations'

const EMPLOYEES = ['STELLA', 'VALLIA', 'SOFIA', 'HARIS']
const EMPLOYEE_COLORS = { STELLA: '#004aad', VALLIA: '#00a3a3', SOFIA: '#ff9f1a', HARIS: '#7b61ff' }

const STATUS_LABELS = {
  draft: 'Άντληση Στοιχείων', submitted: 'Οριστικοποίηση Αίτησης',
  in_review: 'Πρόταση Ρύθμισης', completed: 'Αποδοχή Ρύθμισης', cancelled: 'Απορρίψη Ρύθμισης'
}
const STATUS_COLORS = {
  draft: '#94a3b8', submitted: '#3b82f6', in_review: '#f59e0b',
  completed: '#22c55e', cancelled: '#ef4444'
}

const SCENARIO_LABELS = { 0:'ΝΠ', 1:'Σεν. 1', 2:'Σεν. 2', 3:'Σεν. 3', 4:'Σεν. 4', 5:'Σεν. 5' }
const SCENARIO_COLORS = { 0:'#7c3aed', 1:'#16a34a', 2:'#d97706', 3:'#dc2626', 4:'#2563eb', 5:'#0891b2' }

function KpiCard({ label, value, sub, color = 'text-blue-800' }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value ${color}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
    </div>
  )
}

export default function Statistics({ currentEmployee }) {
  const [overview, setOverview] = useState(null)
  const [comparison, setComparison] = useState([])
  const [empStats, setEmpStats] = useState(null)
  const [selectedEmp, setSelectedEmp] = useState(currentEmployee || '')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([api.getOverview(), api.getComparison()])
      .then(([ov, cmp]) => { setOverview(ov.data); setComparison(cmp.data) })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedEmp) { setEmpStats(null); return }
    api.getEmployeeStats(selectedEmp).then((r) => setEmpStats(r.data))
  }, [selectedEmp])

  if (loading) return <div className="p-10 text-center text-gray-400">Φόρτωση…</div>

  const byStatusData = overview ? Object.entries(overview.by_status).map(([k, v]) => ({
    name: STATUS_LABELS[k] || k, value: v, fill: STATUS_COLORS[k] || '#94a3b8'
  })) : []

  const byEmployeeData = overview ? EMPLOYEES.map((e) => ({
    name: e, count: overview.by_employee[e] || 0, fill: EMPLOYEE_COLORS[e]
  })) : []

  const byScenarioData = overview ? Object.entries(overview.scenario_counts)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: SCENARIO_LABELS[k] || k, value: v, fill: SCENARIO_COLORS[k] || '#64748b' }))
    : []

  const totalActualWrPct = overview && overview.total_estimated_writeoff > 0
    ? Math.round(overview.total_actual_writeoff / overview.total_estimated_writeoff * 100)
    : null

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-black text-blue-800 mb-6">📊 Στατιστικά & Αναφορές</h1>

      {/* Overview KPIs */}
      {overview && (
        <div className="flex flex-wrap gap-3 mb-6">
          <KpiCard label="Σύνολο Υποθέσεων" value={overview.total_cases} />
          <KpiCard label="Εκτ. Συνολική Οφειλή" value={fmt(overview.total_estimated_debt)} />
          <KpiCard label="Εκτ. Συνολική Διαγραφή" value={fmt(overview.total_estimated_writeoff)} color="text-orange-600" />
          <KpiCard label="Πραγματική Διαγραφή" value={fmt(overview.total_actual_writeoff)} color="text-green-700"
            sub={totalActualWrPct != null ? `${totalActualWrPct}% vs εκτίμηση` : undefined} />
          <KpiCard label="Ολοκληρωμένες με Αποτέλεσμα" value={overview.completed_with_actuals} color="text-green-700" />
        </div>
      )}

      {/* Charts row */}
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        {/* Status pie */}
        <div className="card">
          <h3 className="text-sm font-bold text-blue-800 mb-3">Κατανομή κατά Κατάσταση</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={byStatusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`} labelLine={false} fontSize={11}>
                {byStatusData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Employees bar */}
        <div className="card">
          <h3 className="text-sm font-bold text-blue-800 mb-3">Υποθέσεις ανά Υπάλληλο</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={byEmployeeData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" name="Υποθέσεις" radius={[6, 6, 0, 0]}>
                {byEmployeeData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Scenario pie */}
        <div className="card">
          <h3 className="text-sm font-bold text-blue-800 mb-3">Κατανομή Σεναρίων</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={byScenarioData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`} labelLine={false} fontSize={11}>
                {byScenarioData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Comparison table */}
      {comparison.length > 0 && (
        <div className="card mb-6">
          <h3 className="text-sm font-bold text-blue-800 mb-3">📈 Σύγκριση Εκτίμησης vs Πραγματικού</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b-2 border-blue-100">
                  <th className="th text-left">Πελάτης</th>
                  <th className="th">Υπάλληλος</th>
                  <th className="th">Εκτ. Διαγραφή</th>
                  <th className="th">Πραγμ. Διαγραφή</th>
                  <th className="th">Διαφορά</th>
                  <th className="th">Εκτ. Δόση</th>
                  <th className="th">Πραγμ. Δόση</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((c) => {
                  const diff = c.writeoff_diff_pct
                  const positive = diff >= 0
                  return (
                    <tr key={c.id} className="border-b border-gray-100 hover:bg-blue-50">
                      <td className="td text-left font-semibold">{c.client_name}</td>
                      <td className="td">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{c.employee}</span>
                      </td>
                      <td className="td font-mono text-gray-500">{fmt(c.estimated_writeoff)}</td>
                      <td className="td font-mono font-bold">{fmt(c.actual_writeoff)}</td>
                      <td className="td">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${positive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {positive ? '+' : ''}{diff}%
                        </span>
                      </td>
                      <td className="td font-mono text-gray-500">{fmt(c.estimated_monthly)}</td>
                      <td className="td font-mono font-bold">{fmt(c.actual_monthly)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Per-employee stats */}
      <div className="card">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <h3 className="text-sm font-bold text-blue-800">Ανάλυση ανά Υπάλληλο</h3>
          <div className="flex gap-2 flex-wrap">
            {EMPLOYEES.map((e) => (
              <button
                key={e}
                onClick={() => setSelectedEmp(selectedEmp === e ? '' : e)}
                style={{ background: selectedEmp === e ? EMPLOYEE_COLORS[e] : undefined }}
                className={`text-xs font-bold px-3 py-1 rounded-full border transition-all ${selectedEmp === e ? 'text-white border-transparent' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        {empStats && (
          <div>
            <div className="flex flex-wrap gap-3 mb-4">
              <KpiCard label="Σύνολο Υποθέσεων" value={empStats.total_cases} />
              <KpiCard label="Συνολική Οφειλή Υπό Διαχείριση" value={fmt(empStats.total_debt_managed)} />
              <KpiCard label="Εκτ. Συνολική Διαγραφή" value={fmt(empStats.total_estimated_writeoff)} color="text-orange-600" />
              <KpiCard label="Ολοκληρωμένες" value={empStats.completed_with_actuals} color="text-green-700" />
              {empStats.avg_writeoff_accuracy_pct != null && (
                <KpiCard
                  label="Μ.Ο. Ακρίβεια Εκτίμησης Διαγραφής"
                  value={`${empStats.avg_writeoff_accuracy_pct > 0 ? '+' : ''}${empStats.avg_writeoff_accuracy_pct}%`}
                  color={empStats.avg_writeoff_accuracy_pct >= 0 ? 'text-green-700' : 'text-red-600'}
                  sub="σε σχέση με εκτίμηση"
                />
              )}
            </div>

            {empStats.cases_detail?.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[500px]">
                  <thead>
                    <tr className="border-b-2 border-blue-100">
                      <th className="th text-left">Υπόθεση</th>
                      <th className="th">Εκτ. Διαγραφή</th>
                      <th className="th">Πραγμ. Διαγραφή</th>
                      <th className="th">Διαφορά %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {empStats.cases_detail.map((c) => (
                      <tr key={c.case_id} className="border-b border-gray-100">
                        <td className="td text-left font-semibold">{c.client}</td>
                        <td className="td font-mono">{fmt(c.estimated)}</td>
                        <td className="td font-mono font-bold">{fmt(c.actual)}</td>
                        <td className="td">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.diff_pct >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {c.diff_pct > 0 ? '+' : ''}{c.diff_pct}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {!selectedEmp && (
          <div className="text-center text-gray-400 py-6 text-sm">Επιλέξτε υπάλληλο για λεπτομερή ανάλυση</div>
        )}
      </div>
    </div>
  )
}
