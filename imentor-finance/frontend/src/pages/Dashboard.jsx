import { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../api/client';

const fmt = n => n?.toLocaleString('el-GR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';
const fmtPct = n => (n || 0).toFixed(1) + '%';

function KPICard({ label, value, sub, color }) {
  return (
    <div className={`card border-l-4 ${color}`}>
      <div className="text-sm text-gray-500 font-medium">{label}</div>
      <div className="text-3xl font-bold mt-1">{value}</div>
      {sub && <div className="text-sm text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [summary, setSummary] = useState(null);
  const [monthly, setMonthly] = useState([]);
  const [byService, setByService] = useState([]);
  const [byAgent, setByAgent] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get(`/reports/summary?year=${year}`),
      api.get(`/reports/monthly?year=${year}`),
      api.get(`/reports/by-service?year=${year}`),
      api.get(`/reports/by-agent?year=${year}`)
    ]).then(([s, m, sv, ag]) => {
      setSummary(s.data);
      setMonthly(m.data);
      setByService(sv.data.slice(0, 8));
      setByAgent(ag.data);
    }).finally(() => setLoading(false));
  }, [year]);

  const years = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i);

  if (loading) return <div className="p-8 text-gray-500">Φόρτωση...</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <select value={year} onChange={e => setYear(+e.target.value)} className="input w-32">
          {years.map(y => <option key={y}>{y}</option>)}
        </select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Έσοδα" value={fmt(summary?.income)} sub={`${summary?.income_count} εγγραφές`} color="border-green-500" />
        <KPICard label="Έξοδα" value={fmt(summary?.expenses)} sub={`${summary?.expense_count} εγγραφές`} color="border-red-500" />
        <KPICard label="Κέρδος" value={fmt(summary?.profit)} color="border-blue-500" />
        <KPICard label="Περιθώριο Κέρδους" value={fmtPct(summary?.profit_pct)} color="border-purple-500" />
      </div>

      {/* Monthly chart */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Μηνιαία Εικόνα {year}</h2>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={monthly}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month_name" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={v => v.toLocaleString('el-GR')} tick={{ fontSize: 12 }} />
            <Tooltip formatter={(v) => v.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' })} />
            <Legend />
            <Bar dataKey="income" name="Έσοδα" fill="#22c55e" radius={[4,4,0,0]} />
            <Bar dataKey="expenses" name="Έξοδα" fill="#ef4444" radius={[4,4,0,0]} />
            <Bar dataKey="profit" name="Κέρδος" fill="#3b82f6" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Service */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Έσοδα ανά Υπηρεσία</h2>
          <div className="space-y-2">
            {byService.map((s, i) => {
              const pct = summary?.income > 0 ? (s.income / summary.income) * 100 : 0;
              return (
                <div key={i}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="truncate max-w-[60%]">{s.service_type}</span>
                    <span className="font-medium">{fmt(s.income)} <span className="text-gray-400">({pct.toFixed(1)}%)</span></span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className="bg-primary-500 h-2 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* By Agent */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Έσοδα ανά Πράκτορα</h2>
          <div className="space-y-3">
            {byAgent.map((a, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div>
                  <div className="font-medium text-sm">{a.agent}</div>
                  <div className="text-xs text-gray-500">{a.count} εγγραφές · Bonus: {fmt(a.bonus)}</div>
                </div>
                <div className="font-semibold text-green-600">{fmt(a.income)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
