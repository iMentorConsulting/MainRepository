import { useState, useEffect } from 'react';
import { BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../../api/client';

const fmt = n => n != null ? Math.round(n).toLocaleString('el-GR') + ' €' : '—';
const fmtPct = n => (n || 0).toFixed(1) + '%';

const PALETTE = ['#6366f1','#10b981','#f59e0b','#f43f5e','#a855f7','#06b6d4','#ec4899','#84cc16','#f97316','#64748b'];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-700 px-4 py-3 text-sm"
      style={{ background: '#1e1b4b', boxShadow: '0 10px 40px rgba(0,0,0,0.4)' }}>
      <div className="text-slate-300 text-xs font-bold uppercase tracking-wide mb-2">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-300 text-xs">{p.name}:</span>
          <span className="text-white font-bold text-xs">{Math.round(p.value).toLocaleString('el-GR')} €</span>
        </div>
      ))}
    </div>
  );
};

const StatCard = ({ label, value, color }) => (
  <div className={`card p-5 border-l-4 ${color}`}>
    <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</div>
    <div className="text-2xl font-black text-slate-800">{value}</div>
  </div>
);

export default function ReportsPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState('');
  const [monthly, setMonthly] = useState([]);
  const [byService, setByService] = useState([]);
  const [byAgent, setByAgent] = useState([]);
  const [byExpCat, setByExpCat] = useState([]);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    const q = month ? `year=${year}&month=${month}` : `year=${year}`;
    Promise.all([
      api.get(`/reports/monthly?year=${year}`),
      api.get(`/reports/by-service?${q}`),
      api.get(`/reports/by-agent?${q}`),
      api.get(`/reports/expenses-by-category?${q}`),
      api.get(`/reports/summary?${q}`)
    ]).then(([m, sv, ag, ec, sm]) => {
      setMonthly(m.data.map(d => ({ ...d, name: d.month_name.slice(0, 3) })));
      setByService(sv.data);
      setByAgent(ag.data);
      setByExpCat(ec.data);
      setSummary(sm.data);
    });
  }, [year, month]);

  const years = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i);
  const months = ['','01','02','03','04','05','06','07','08','09','10','11','12'];
  const monthLabels = ['Όλοι οι μήνες','Ιαν','Φεβ','Μαρ','Απρ','Μαι','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Αναφορές</h1>
          <p className="page-sub">Ανάλυση εσόδων, εξόδων & κερδοφορίας</p>
        </div>
        <div className="flex gap-2">
          <select className="input w-28" value={year} onChange={e => setYear(+e.target.value)}>
            {years.map(y => <option key={y}>{y}</option>)}
          </select>
          <select className="input w-44" value={month} onChange={e => setMonth(e.target.value)}>
            {months.map((m, i) => <option key={m} value={m}>{monthLabels[i]}</option>)}
          </select>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Έσοδα" value={fmt(summary.income)} color="border-emerald-400" />
          <StatCard label="Έξοδα" value={fmt(summary.expenses)} color="border-rose-400" />
          <StatCard label="Κέρδος" value={fmt(summary.profit)} color="border-indigo-400" />
          <StatCard label="Περιθώριο" value={fmtPct(summary.profit_pct)} color="border-amber-400" />
        </div>
      )}

      <div className="card p-6">
        <h2 className="section-title">Μηνιαία Εξέλιξη {year}</h2>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={monthly} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="rIncome" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="rExpense" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="rProfit" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={v => `${Math.round(v/1000)}k`} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 16 }} />
            <Area type="monotone" dataKey="income" name="Έσοδα" stroke="#10b981" strokeWidth={2} fill="url(#rIncome)" dot={false} />
            <Area type="monotone" dataKey="expenses" name="Έξοδα" stroke="#f43f5e" strokeWidth={2} fill="url(#rExpense)" dot={false} />
            <Area type="monotone" dataKey="profit" name="Κέρδος" stroke="#6366f1" strokeWidth={2} fill="url(#rProfit)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card p-6">
          <h2 className="section-title">Έσοδα ανά Υπηρεσία</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={byService.slice(0, 10)} layout="vertical" margin={{ left: 0, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tickFormatter={v => `${Math.round(v/1000)}k`} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="service_type" width={140} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="income" name="Έσοδα" fill="#6366f1" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-6">
          <h2 className="section-title">Έξοδα ανά Κατηγορία</h2>
          {byExpCat.length > 0 ? (
            <div className="space-y-2.5 mt-2">
              {byExpCat.slice(0, 8).map((item, i) => {
                const total = byExpCat.reduce((s, x) => s + x.total, 0);
                const pct = total > 0 ? (item.total / total) * 100 : 0;
                return (
                  <div key={i}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-medium text-slate-600 truncate max-w-[55%]">{item.category}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">{pct.toFixed(0)}%</span>
                        <span className="text-xs font-bold text-slate-800">{fmt(item.total)}</span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: PALETTE[i % PALETTE.length] }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <p className="text-slate-400 text-sm text-center py-8">Δεν υπάρχουν δεδομένα</p>}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="section-title mb-0">Αποτελέσματα ανά Πράκτορα</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {['Πράκτορας','Εγγραφές','Έσοδα','Bonus'].map(h => (
                  <th key={h} className="th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byAgent.map((a, i) => (
                <tr key={i} className="tr">
                  <td className="td">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black text-white shrink-0"
                        style={{ background: `hsl(${220 + i * 35}, 70%, 55%)` }}>
                        {(a.agent || '?')[0]}
                      </div>
                      <span className="font-semibold text-slate-800">{a.agent}</span>
                    </div>
                  </td>
                  <td className="td text-slate-500">{a.count}</td>
                  <td className="td font-bold text-emerald-600">{fmt(a.income)}</td>
                  <td className="td font-semibold text-amber-500">{fmt(a.bonus)}</td>
                </tr>
              ))}
              {byAgent.length === 0 && (
                <tr><td colSpan={4} className="td text-center text-slate-400 py-10">Δεν υπάρχουν δεδομένα</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
