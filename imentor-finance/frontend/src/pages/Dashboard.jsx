import { useState, useEffect } from 'react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import api from '../api/client';

const fmt = n => n != null ? Math.round(n).toLocaleString('el-GR') + ' €' : '—';
const fmtK = n => {
  if (!n) return '0 €';
  return n >= 1000 ? (n / 1000).toFixed(1).replace('.', ',') + ' χιλ.€' : Math.round(n) + ' €';
};

function KPICard({ label, value, sub, type }) {
  const styles = {
    income:  { bg: 'linear-gradient(135deg, #10b981, #059669)', shadow: '0 8px 32px rgba(16,185,129,0.25)' },
    expense: { bg: 'linear-gradient(135deg, #f43f5e, #e11d48)', shadow: '0 8px 32px rgba(244,63,94,0.25)' },
    profit:  { bg: 'linear-gradient(135deg, #6366f1, #8b5cf6)', shadow: '0 8px 32px rgba(99,102,241,0.25)' },
    margin:  { bg: 'linear-gradient(135deg, #f59e0b, #f97316)', shadow: '0 8px 32px rgba(245,158,11,0.2)' },
  };
  const s = styles[type];
  return (
    <div className="relative overflow-hidden rounded-2xl p-6 text-white"
      style={{ background: s.bg, boxShadow: s.shadow }}>
      <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-white/10" />
      <div className="absolute -right-1 -bottom-6 w-16 h-16 rounded-full bg-white/5" />
      <div className="relative">
        <div className="text-xs font-bold uppercase tracking-widest opacity-75 mb-2">{label}</div>
        <div className="text-3xl font-black tracking-tight">{value}</div>
        {sub && <div className="text-xs opacity-60 mt-1.5 font-medium">{sub}</div>}
      </div>
    </div>
  );
}

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

export default function Dashboard() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [summary, setSummary] = useState(null);
  const [monthly, setMonthly] = useState([]);
  const [byService, setByService] = useState([]);
  const [byAgent, setByAgent] = useState([]);

  useEffect(() => {
    const buildParams = (base) => {
      const p = new URLSearchParams(base);
      if (dateFrom) p.set('date_from', dateFrom);
      if (dateTo) p.set('date_to', dateTo);
      return p.toString();
    };
    Promise.all([
      api.get(`/reports/summary?${buildParams(`year=${year}`)}`),
      api.get(`/reports/monthly?year=${year}`),
      api.get(`/reports/by-service?${buildParams(`year=${year}`)}`),
      api.get(`/reports/by-agent?${buildParams(`year=${year}`)}`)
    ]).then(([s, m, sv, ag]) => {
      setSummary(s.data);
      setMonthly(m.data.map(d => ({ ...d, name: d.month_name.slice(0, 3) })));
      setByService(sv.data.slice(0, 7));
      setByAgent(ag.data.slice(0, 6));
    });
  }, [year, dateFrom, dateTo]);

  const years = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-sub">Οικονομική επισκόπηση</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={year} onChange={e => setYear(+e.target.value)} className="input w-28">
            {years.map(y => <option key={y}>{y}</option>)}
          </select>
          <div className="flex items-center gap-1 text-slate-400 text-xs">ή</div>
          <div className="flex items-center gap-1">
            <input type="date" className="input w-36 text-sm" value={dateFrom} onChange={e => setDateFrom(e.target.value)} placeholder="Από" />
            <span className="text-slate-400 text-xs">—</span>
            <input type="date" className="input w-36 text-sm" value={dateTo} onChange={e => setDateTo(e.target.value)} placeholder="Έως" />
            {(dateFrom || dateTo) && (
              <button className="btn-ghost btn-sm text-xs" onClick={() => { setDateFrom(''); setDateTo(''); }}>✕</button>
            )}
          </div>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Έσοδα" type="income"  value={fmtK(summary?.income)}   sub={`${summary?.income_count ?? 0} εισπράξεις`} />
        <KPICard label="Έξοδα" type="expense" value={fmtK(summary?.expenses)} sub={`${summary?.expense_count ?? 0} εγγραφές`} />
        <KPICard label="Κέρδος" type="profit" value={fmtK(summary?.profit)} />
        <KPICard label="Περιθώριο" type="margin" value={`${(summary?.profit_pct ?? 0).toFixed(1)}%`} />
      </div>

      {/* Monthly chart */}
      <div className="card p-6">
        <h2 className="section-title">Μηνιαία Εξέλιξη {year}</h2>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={monthly} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gIncome" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gExpense" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gProfit" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={v => `${Math.round(v/1000)}k`} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 16 }} />
            <Area type="monotone" dataKey="income" name="Έσοδα" stroke="#10b981" strokeWidth={2} fill="url(#gIncome)" dot={false} />
            <Area type="monotone" dataKey="expenses" name="Έξοδα" stroke="#f43f5e" strokeWidth={2} fill="url(#gExpense)" dot={false} />
            <Area type="monotone" dataKey="profit" name="Κέρδος" stroke="#6366f1" strokeWidth={2} fill="url(#gProfit)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* By Service */}
        <div className="card p-6">
          <h2 className="section-title">Έσοδα ανά Υπηρεσία</h2>
          <div className="space-y-3">
            {byService.map((s, i) => {
              const pct = summary?.income > 0 ? (s.income / summary.income) * 100 : 0;
              return (
                <div key={i} className="group">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-xs font-medium text-slate-600 truncate max-w-[55%]">{s.service_type}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-slate-400">{pct.toFixed(0)}%</span>
                      <span className="text-xs font-bold text-slate-800">{fmt(s.income)}</span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #6366f1, #a855f7)' }} />
                  </div>
                </div>
              );
            })}
            {byService.length === 0 && <p className="text-slate-400 text-sm text-center py-4">Δεν υπάρχουν δεδομένα</p>}
          </div>
        </div>

        {/* By Agent */}
        <div className="card p-6">
          <h2 className="section-title">Αποτελέσματα ανά Πράκτορα</h2>
          <div className="space-y-2">
            {byAgent.map((a, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black text-white shrink-0"
                    style={{ background: `hsl(${220 + i * 35}, 70%, 55%)` }}>
                    {(a.agent || '?')[0]}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-800">{a.agent}</div>
                    <div className="text-xs text-slate-400">{a.count} εγγραφές</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-emerald-600">{fmt(a.income)}</div>
                  <div className="text-xs text-amber-500">+{fmt(a.bonus)} bonus</div>
                </div>
              </div>
            ))}
            {byAgent.length === 0 && <p className="text-slate-400 text-sm text-center py-4">Δεν υπάρχουν δεδομένα</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
