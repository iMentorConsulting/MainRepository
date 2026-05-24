import { useState, useEffect } from 'react';
import { BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../../api/client';

const fmt = n => n != null ? Math.round(n).toLocaleString('el-GR') + ' €' : '—';
const fmtPct = n => (n || 0).toFixed(1) + '%';
const fmtMoney = n => Number(n).toLocaleString('el-GR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';

const PALETTE = ['#6366f1','#10b981','#f59e0b','#f43f5e','#a855f7','#06b6d4'];

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

const RANK_BADGES = [
  { label: '🥇 1ος', bg: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-amber-300' },
  { label: '🥈 2ος', bg: 'bg-slate-100', text: 'text-slate-600', ring: 'ring-slate-300' },
  { label: '🥉 3ος', bg: 'bg-orange-50', text: 'text-orange-700', ring: 'ring-orange-300' },
];

function TabOverview({ year, setYear, month, setMonth, years, months, monthLabels, monthly, byService, byAgent, byExpCat, summary, dateFrom, setDateFrom, dateTo, setDateTo }) {
  return (
    <>
      <div className="flex flex-wrap gap-2 mb-6">
        <select className="input w-28" value={year} onChange={e => setYear(+e.target.value)}>
          {years.map(y => <option key={y}>{y}</option>)}
        </select>
        <select className="input w-44" value={month} onChange={e => setMonth(e.target.value)}>
          {months.map((m, i) => <option key={m} value={m}>{monthLabels[i]}</option>)}
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
    </>
  );
}

function TabTopCustomers({ years }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState([]);
  const [sortCol, setSortCol] = useState('income');
  const [sortDir, setSortDir] = useState('desc');

  useEffect(() => {
    api.get(`/reports/by-customer?year=${year}`).then(r => setData(r.data)).catch(() => setData([]));
  }, [year]);

  const handleSort = col => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
  };

  const sorted = [...data].sort((a, b) => {
    const av = a[sortCol] ?? 0;
    const bv = b[sortCol] ?? 0;
    if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  const top3 = [data[0], data[1], data[2]].filter(Boolean);
  const chartData = data.slice(0, 10).map(d => ({ name: d.customer_name, income: d.income }));

  const SortIcon = ({ col }) => {
    if (sortCol !== col) return <span className="text-slate-300 ml-1">↕</span>;
    return <span className="text-indigo-500 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  return (
    <>
      <div className="flex gap-2 mb-6">
        <select className="input w-28" value={year} onChange={e => setYear(+e.target.value)}>
          {years.map(y => <option key={y}>{y}</option>)}
        </select>
      </div>

      {top3.length > 0 && (
        <>
          <p className="text-xs text-slate-400 mb-3">Τα μετάλλια απονέμονται στους 3 πελάτες με το μεγαλύτερο συνολικό εισπραχθέν ποσό για το επιλεγμένο έτος.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {top3.map((c, i) => {
              const badge = RANK_BADGES[i];
              return (
                <div key={i} className={`card p-5 border-t-4 ${i === 0 ? 'border-amber-400' : i === 1 ? 'border-slate-400' : 'border-orange-400'}`}>
                  <div className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold mb-3 ring-1 ${badge.bg} ${badge.text} ${badge.ring}`}>
                    {badge.label}
                  </div>
                  <div className="font-bold text-slate-800 text-sm mb-1 truncate">{c.customer_name}</div>
                  <div className="text-xs text-slate-400 mb-3">{c.vat_number}</div>
                  <div className="text-xl font-black text-emerald-600">{fmtMoney(c.income)}</div>
                  <div className="flex gap-3 mt-2">
                    <span className="text-xs text-slate-400">{c.count} εγγραφές</span>
                    <span className="text-xs text-slate-400">{c.service_count} υπηρεσίες</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {chartData.length > 0 && (
        <div className="card p-6 mb-6">
          <h2 className="section-title">Top 10 Πελάτες — Εισπράξεις {year}</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tickFormatter={v => `${Math.round(v/1000)}k`} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="income" name="Εισπράξεις" radius={[0, 6, 6, 0]}>
                {chartData.map((_, idx) => (
                  <Cell key={idx} fill={PALETTE[idx % PALETTE.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="section-title mb-0">Πλήρης Κατάταξη Πελατών {year}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Κατάταξη</th>
                {[
                  { label: 'Πελάτης', col: 'customer_name' },
                  { label: 'Εισπράξεις', col: 'income' },
                  { label: 'Αρ. Εγγραφών', col: 'count' },
                  { label: 'Υπηρεσίες', col: 'service_count' },
                ].map(({ label, col }) => (
                  <th key={col} className="th cursor-pointer select-none hover:text-indigo-600 transition-colors"
                    onClick={() => handleSort(col)}>
                    {label}<SortIcon col={col} />
                  </th>
                ))}
                <th className="th">Υπηρεσίες</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, i) => {
                const originalRank = data.findIndex(d => d.vat_number === row.vat_number || d.customer_name === row.customer_name) + 1;
                return (
                  <tr key={i} className="tr">
                    <td className="td">
                      {originalRank <= 3 ? (
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold ring-1 ${RANK_BADGES[originalRank - 1].bg} ${RANK_BADGES[originalRank - 1].text} ${RANK_BADGES[originalRank - 1].ring}`}>
                          {RANK_BADGES[originalRank - 1].label}
                        </span>
                      ) : (
                        <span className="badge-gray">{originalRank}</span>
                      )}
                    </td>
                    <td className="td font-semibold text-slate-800">{row.customer_name}</td>
                    <td className="td font-bold text-emerald-600">{fmtMoney(row.income)}</td>
                    <td className="td text-slate-500">{row.count}</td>
                    <td className="td text-slate-500">{row.service_count}</td>
                    <td className="td text-xs text-slate-500 max-w-[200px] truncate">{row.services || '—'}</td>
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr><td colSpan={6} className="td text-center text-slate-400 py-10">Δεν υπάρχουν δεδομένα</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function TabAccountants({ years }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState('');
  const [data, setData] = useState([]);

  const months = ['','01','02','03','04','05','06','07','08','09','10','11','12'];
  const monthLabels = ['Όλοι οι μήνες','Ιαν','Φεβ','Μαρ','Απρ','Μαι','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];

  useEffect(() => {
    const q = month ? `year=${year}&month=${month}` : `year=${year}`;
    api.get(`/reports/by-accountant?${q}`).then(r => setData(r.data)).catch(() => setData([]));
  }, [year, month]);

  return (
    <>
      <div className="flex gap-2 mb-6">
        <select className="input w-28" value={year} onChange={e => setYear(+e.target.value)}>
          {years.map(y => <option key={y}>{y}</option>)}
        </select>
        <select className="input w-44" value={month} onChange={e => setMonth(e.target.value)}>
          {months.map((m, i) => <option key={m} value={m}>{monthLabels[i]}</option>)}
        </select>
        <button
          className="ml-auto px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold transition-colors"
          onClick={() => window.print()}>
          Εκτύπωση
        </button>
      </div>

      {data.length === 0 && (
        <div className="card p-10 text-center text-slate-400 text-sm">Δεν υπάρχουν δεδομένα</div>
      )}

      <div className="space-y-6">
        {data.map((acc, ai) => {
          const records = acc.records ?? [];
          const total = acc.total ?? records.reduce((s, r) => s + Number(r.amount_collected || 0), 0);
          return (
            <div key={ai} className="card overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black text-white shrink-0"
                    style={{ background: `hsl(${220 + ai * 45}, 65%, 52%)` }}>
                    {(acc.accountant || '?')[0]}
                  </div>
                  <div>
                    <div className="font-bold text-slate-800">{acc.accountant}</div>
                    {acc.email && <div className="text-xs text-slate-400">{acc.email}</div>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-400 uppercase font-semibold tracking-wide">Σύνολο</div>
                  <div className="text-lg font-black text-emerald-600">{fmtMoney(total)}</div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      {['Πελάτης','Υπηρεσία','Ποσό','Ημερομηνία','Αρ. Τιμολογίου','Κατάσταση'].map(h => (
                        <th key={h} className="th">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r, ri) => (
                      <tr key={ri} className="tr">
                        <td className="td font-medium text-slate-800">{r.customer_name}</td>
                        <td className="td text-slate-500 text-xs">{r.service_type}</td>
                        <td className="td font-bold text-emerald-600">{fmtMoney(r.amount_collected)}</td>
                        <td className="td text-slate-500 text-xs">{r.sale_date ? new Date(r.sale_date).toLocaleDateString('el-GR') : '—'}</td>
                        <td className="td text-slate-500 font-mono text-xs">{r.invoice_number || '—'}</td>
                        <td className="td">
                          {r.work_status ? (
                            <span className={`badge ${r.work_status === 'Ολοκληρώθηκε' ? 'badge-green' : r.work_status === 'Σε εξέλιξη' ? 'badge-blue' : 'badge-gray'}`}>
                              {r.work_status}
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                    {records.length === 0 && (
                      <tr><td colSpan={6} className="td text-center text-slate-400 py-6">Δεν υπάρχουν εγγραφές</td></tr>
                    )}
                    {records.length > 0 && (
                      <tr className="bg-slate-50 border-t-2 border-slate-200">
                        <td className="td font-bold text-slate-700" colSpan={2}>Σύνολο</td>
                        <td className="td font-black text-emerald-700">{fmtMoney(total)}</td>
                        <td className="td" colSpan={3}></td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

const TABS = [
  { id: 'overview', label: 'Επισκόπηση' },
  { id: 'top-customers', label: 'Κορυφαίοι Πελάτες' },
  { id: 'accountants', label: 'Αναφορά Λογιστών' },
];

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [monthly, setMonthly] = useState([]);
  const [byService, setByService] = useState([]);
  const [byAgent, setByAgent] = useState([]);
  const [byExpCat, setByExpCat] = useState([]);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    if (activeTab !== 'overview') return;
    const buildQ = (base) => {
      const params = new URLSearchParams(base);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      return params.toString();
    };
    const q = month ? `year=${year}&month=${month}` : `year=${year}`;
    Promise.all([
      api.get(`/reports/monthly?year=${year}`),
      api.get(`/reports/by-service?${buildQ(q)}`),
      api.get(`/reports/by-agent?${buildQ(q)}`),
      api.get(`/reports/expenses-by-category?${buildQ(q)}`),
      api.get(`/reports/summary?${buildQ(q)}`)
    ]).then(([m, sv, ag, ec, sm]) => {
      setMonthly(m.data.map(d => ({ ...d, name: d.month_name.slice(0, 3) })));
      setByService(sv.data);
      setByAgent(ag.data);
      setByExpCat(ec.data);
      setSummary(sm.data);
    });
  }, [year, month, dateFrom, dateTo, activeTab]);

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
      </div>

      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'border-indigo-500 text-indigo-600 bg-indigo-50'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <TabOverview
          year={year} setYear={setYear}
          month={month} setMonth={setMonth}
          years={years} months={months} monthLabels={monthLabels}
          monthly={monthly} byService={byService} byAgent={byAgent}
          byExpCat={byExpCat} summary={summary}
          dateFrom={dateFrom} setDateFrom={setDateFrom}
          dateTo={dateTo} setDateTo={setDateTo}
        />
      )}
      {activeTab === 'top-customers' && <TabTopCustomers years={years} />}
      {activeTab === 'accountants' && <TabAccountants years={years} />}
    </div>
  );
}
