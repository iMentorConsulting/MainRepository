import { useState, useEffect, useRef } from 'react';
import { BarChart, Bar, AreaChart, Area, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../../api/client';

function MultiSelectDropdown({ label, options, selected, onChange, getKey, getLabel }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const allSelected = selected.length === 0;
  const displayLabel = allSelected ? label
    : selected.length === 1
      ? getLabel(options.find(o => getKey(o) === selected[0]) || {})
      : `${selected.length} επιλεγμένα`;
  const toggle = key => onChange(selected.includes(key) ? selected.filter(k => k !== key) : [...selected, key]);
  return (
    <div className="relative" ref={ref}>
      <button type="button"
        className="input flex items-center justify-between gap-2 min-w-[110px] text-left"
        onClick={() => setOpen(v => !v)}>
        <span className={`truncate text-sm ${allSelected ? 'text-slate-400' : 'text-slate-700'}`}>{displayLabel}</span>
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-slate-400 shrink-0">
          <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd"/>
        </svg>
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 min-w-[140px] bg-white border border-slate-200 rounded-xl shadow-lg py-1 max-h-64 overflow-y-auto">
          <label className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer border-b border-slate-100">
            <input type="checkbox" checked={allSelected} onChange={() => onChange([])}
              className="w-4 h-4 rounded border-slate-300 text-primary-600" />
            <span className="text-sm text-slate-600 font-medium">{label}</span>
          </label>
          {options.map(opt => {
            const key = getKey(opt);
            return (
              <label key={key} className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                <input type="checkbox" checked={selected.includes(key)} onChange={() => toggle(key)}
                  className="w-4 h-4 rounded border-slate-300 text-primary-600" />
                <span className="text-sm text-slate-700">{getLabel(opt)}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

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

const MONTH_OPTS = [
  { value: '01', label: 'Ιαν' }, { value: '02', label: 'Φεβ' }, { value: '03', label: 'Μαρ' },
  { value: '04', label: 'Απρ' }, { value: '05', label: 'Μαι' }, { value: '06', label: 'Ιουν' },
  { value: '07', label: 'Ιουλ' }, { value: '08', label: 'Αυγ' }, { value: '09', label: 'Σεπ' },
  { value: '10', label: 'Οκτ' }, { value: '11', label: 'Νοε' }, { value: '12', label: 'Δεκ' },
];

function TabOverview({ selectedYears, setSelectedYears, selectedMonths, setSelectedMonths, years, monthly, byService, byAgent, byExpCat, summary, dateFrom, setDateFrom, dateTo, setDateTo, serviceTypes }) {
  return (
    <>
      <div className="flex flex-wrap gap-2 mb-6">
        <MultiSelectDropdown
          label="Έτος"
          options={years.map(y => ({ value: String(y), label: String(y) }))}
          selected={selectedYears.map(String)}
          onChange={v => setSelectedYears(v.length ? v.map(Number) : [])}
          getKey={o => o.value}
          getLabel={o => o.label}
        />
        <MultiSelectDropdown
          label="Μήνας"
          options={MONTH_OPTS}
          selected={selectedMonths}
          onChange={setSelectedMonths}
          getKey={o => o.value}
          getLabel={o => o.label}
        />
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
        <h2 className="section-title">Μηνιαία Εξέλιξη {selectedYears[0] || ''}</h2>
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
          {(() => {
            const hasCategories = serviceTypes?.some(s => s.category);
            const GRAD = ['#6366f1','#10b981','#f59e0b','#f43f5e'];
            if (hasCategories && byService.length > 0) {
              const catMap = {};
              (serviceTypes || []).forEach(s => { catMap[s.value] = s.category || 'Άλλα'; });
              const groups = {};
              byService.forEach(s => {
                const cat = catMap[s.service_type] || 'Άλλα';
                if (!groups[cat]) groups[cat] = { income: 0, items: [] };
                groups[cat].income += parseFloat(s.income) || 0;
                groups[cat].items.push(s);
              });
              const sorted = Object.entries(groups).sort((a, b) => b[1].income - a[1].income);
              const totalIncome = summary?.income || 0;
              return (
                <div className="space-y-5">
                  {sorted.map(([cat, info], ci) => {
                    const catPct = totalIncome > 0 ? (info.income / totalIncome) * 100 : 0;
                    return (
                      <div key={cat}>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">{cat}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400">{catPct.toFixed(0)}%</span>
                            <span className="text-sm font-black text-slate-800">{fmt(info.income)}</span>
                          </div>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden mb-2">
                          <div className="h-full rounded-full transition-all"
                            style={{ width: `${catPct}%`, background: GRAD[ci % GRAD.length] }} />
                        </div>
                        <div className="pl-3 space-y-1 border-l-2 border-slate-100">
                          {info.items.sort((a, b) => b.income - a.income).map((s, si) => {
                            const sPct = info.income > 0 ? (s.income / info.income) * 100 : 0;
                            return (
                              <div key={si} className="flex justify-between items-center">
                                <span className="text-[11px] text-slate-500 truncate max-w-[55%]">{s.service_type}</span>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-[10px] text-slate-300">{sPct.toFixed(0)}%</span>
                                  <span className="text-[11px] font-semibold text-slate-600">{fmt(s.income)}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            }
            return (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={byService.slice(0, 10)} layout="vertical" margin={{ left: 0, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tickFormatter={v => `${Math.round(v/1000)}k`} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="service_type" width={140} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="income" name="Έσοδα" fill="#6366f1" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            );
          })()}
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
  const [selectedYears, setSelectedYears] = useState([years[0] || new Date().getFullYear()]);
  const [data, setData] = useState([]);
  const [sortCol, setSortCol] = useState('income');
  const [sortDir, setSortDir] = useState('desc');

  useEffect(() => {
    if (years.length > 0 && !years.includes(selectedYears[0])) setSelectedYears([years[0]]);
  }, [years]);

  useEffect(() => {
    const q = selectedYears.length > 1 ? `years=${selectedYears.join(',')}` : `year=${selectedYears[0] || ''}`;
    api.get(`/reports/by-customer?${q}`)
      .then(r => setData(r.data))
      .catch(() => setData([]));
  }, [selectedYears]);

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
        <MultiSelectDropdown
          label="Έτος"
          options={years.map(y => ({ value: String(y), label: String(y) }))}
          selected={selectedYears.map(String)}
          onChange={v => setSelectedYears(v.length ? v.map(Number) : [years[0] || new Date().getFullYear()])}
          getKey={o => o.value}
          getLabel={o => o.label}
        />
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
          <h2 className="section-title">Top 10 Πελάτες — Εισπράξεις {selectedYears.join(', ')}</h2>
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
          <h2 className="section-title mb-0">Πλήρης Κατάταξη Πελατών {selectedYears.join(', ')}</h2>
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
  const [selectedYears, setSelectedYears] = useState([years[0] || new Date().getFullYear()]);
  const [selectedMonths, setSelectedMonths] = useState([]);
  const [data, setData] = useState([]);
  const [selectedAccountants, setSelectedAccountants] = useState([]);
  const [sortCol, setSortCol] = useState('total');
  const [sortDir, setSortDir] = useState('desc');

  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedYears.length === 1) params.set('year', selectedYears[0]);
    else if (selectedYears.length > 1) params.set('years', selectedYears.join(','));
    if (selectedMonths.length === 1) params.set('month', selectedMonths[0]);
    else if (selectedMonths.length > 1) params.set('months', selectedMonths.join(','));
    api.get(`/reports/by-accountant?${params.toString()}`).then(r => setData(r.data)).catch(() => setData([]));
  }, [selectedYears, selectedMonths]);

  // Build flat list of accountants for multi-select
  const accountantOptions = data.map((acc, i) => ({
    key: acc.accountant || String(i),
    name: acc.accountant || '—',
    total: acc.total ?? 0,
    count: (acc.records ?? []).length,
  }));

  const filteredData = selectedAccountants.length > 0
    ? data.filter(acc => selectedAccountants.includes(acc.accountant))
    : data;

  // Top 10 summary: use flat accountant data (accountant_name, count, total from API or derived)
  const top10 = [...data]
    .map(acc => {
      const records = acc.records ?? [];
      const total = acc.total ?? records.reduce((s, r) => s + Number(r.amount_collected || 0), 0);
      const uniqueCustomers = new Set(records.map(r => r.customer_name || r.vat_number)).size;
      return { accountant: acc.accountant, total, uniqueCustomers, count: acc.count ?? records.length };
    })
    .sort((a, b) => {
      const av = a[sortCol === 'total' ? 'total' : sortCol] ?? 0;
      const bv = b[sortCol === 'total' ? 'total' : sortCol] ?? 0;
      return sortDir === 'desc' ? bv - av : av - bv;
    })
    .slice(0, 10);

  const handleTopSort = col => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  };
  const SortIcon = ({ col }) => sortCol === col
    ? <span className="text-indigo-500 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
    : <span className="text-slate-300 ml-1">↕</span>;

  return (
    <>
      <div className="flex flex-wrap gap-2 mb-6 items-center">
        <MultiSelectDropdown
          label="Έτος"
          options={years.map(y => ({ value: String(y), label: String(y) }))}
          selected={selectedYears.map(String)}
          onChange={v => setSelectedYears(v.length ? v.map(Number) : [years[0] || new Date().getFullYear()])}
          getKey={o => o.value}
          getLabel={o => o.label}
        />
        <MultiSelectDropdown
          label="Μήνας"
          options={MONTH_OPTS}
          selected={selectedMonths}
          onChange={setSelectedMonths}
          getKey={o => o.value}
          getLabel={o => o.label}
        />
        {/* Multi-select accountant filter */}
        <div className="flex items-center gap-1">
          {accountantOptions.map(opt => (
            <label key={opt.key} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer text-sm select-none">
              <input type="checkbox"
                checked={selectedAccountants.includes(opt.key)}
                onChange={() => {
                  setSelectedAccountants(prev =>
                    prev.includes(opt.key) ? prev.filter(k => k !== opt.key) : [...prev, opt.key]
                  );
                }}
                className="w-3.5 h-3.5 rounded border-slate-300 text-primary-600" />
              <span className="text-slate-700">{opt.name}</span>
              <span className="text-xs text-slate-400">({opt.count})</span>
            </label>
          ))}
          {selectedAccountants.length > 0 && (
            <button className="btn-ghost btn-sm text-xs" onClick={() => setSelectedAccountants([])}>✕ Καθαρισμός</button>
          )}
        </div>
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
        {filteredData.map((acc, ai) => {
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

      {/* Top 10 Λογιστές table */}
      {top10.length > 0 && (
        <div className="card overflow-hidden mt-6">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="section-title mb-0">Top 10 Λογιστές</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Κατάταξη</th>
                  <th className="th cursor-pointer select-none hover:text-indigo-600" onClick={() => handleTopSort('accountant')}>
                    Λογιστής <SortIcon col="accountant" />
                  </th>
                  <th className="th cursor-pointer select-none hover:text-indigo-600" onClick={() => handleTopSort('uniqueCustomers')}>
                    Πελάτες <SortIcon col="uniqueCustomers" />
                  </th>
                  <th className="th cursor-pointer select-none hover:text-indigo-600" onClick={() => handleTopSort('total')}>
                    Σύνολο Εισπράξεων € <SortIcon col="total" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {top10.map((row, i) => (
                  <tr key={i} className="tr">
                    <td className="td">
                      {i < 3 ? (
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold ring-1 ${RANK_BADGES[i].bg} ${RANK_BADGES[i].text} ${RANK_BADGES[i].ring}`}>
                          {RANK_BADGES[i].label}
                        </span>
                      ) : (
                        <span className="badge-gray">{i + 1}</span>
                      )}
                    </td>
                    <td className="td font-semibold text-slate-800">{row.accountant}</td>
                    <td className="td text-slate-500">{row.uniqueCustomers}</td>
                    <td className="td font-bold text-emerald-600">{fmtMoney(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function TabOpenCases({ years: propYears }) {
  const defaultYear = propYears?.[0] || new Date().getFullYear();
  const [caseYears, setCaseYears] = useState([]);
  const years = caseYears.length > 0 ? caseYears : (propYears?.length > 0 ? propYears : Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i));
  const [year, setYear] = useState(defaultYear);
  const [data, setData] = useState([]);
  const STATUS_COLORS = { open: '#10b981', frozen: '#f59e0b', completed_ok: '#6366f1', completed_fail: '#f43f5e' };

  useEffect(() => {
    api.get('/reports/available-case-years').then(r => {
      const yrs = r.data || [];
      if (yrs.length > 0) {
        setCaseYears(yrs);
        setYear(prev => yrs.includes(prev) ? prev : yrs[0]);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    api.get(`/reports/open-cases?year=${year}`)
      .then(r => { setData(r.data); })
      .catch(() => {});
  }, [year]);

  const hasData = data.some(m => m.total > 0);
  const chartData = data.filter(m => m.total > 0).map(m => ({
    month: m.month_name,
    'Εν Εξελίξει': m.open,
    'Παγωμένες': m.frozen,
    'Ολοκλ. Επιτ.': m.completed_ok,
    'Ολοκλ. Fail': m.completed_fail
  }));

  const agents = [...new Set(data.flatMap(m => m.agents.map(a => a.agent)).filter(Boolean))];

  return (
    <div className="space-y-6">
      <div className="filter-bar">
        <select className="input w-28" value={year || ''} onChange={e => setYear(+e.target.value)}>
          {years.map(y => <option key={y}>{y}</option>)}
        </select>
      </div>

      {hasData && (
        <div className="card p-6">
          <h2 className="section-title">Μηνιαία Κατάσταση Υποθέσεων — {year}</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              {['Εν Εξελίξει','Παγωμένες','Ολοκλ. Επιτ.','Ολοκλ. Fail'].map((k, i) => (
                <Bar key={k} dataKey={k} fill={Object.values(STATUS_COLORS)[i]} radius={[3,3,0,0]} maxBarSize={30} stackId="a" />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {agents.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 text-xs font-bold text-slate-500 uppercase tracking-wide">Ανά Υπάλληλο</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="th">Υπάλληλος</th>
                  {data.filter(m => m.total > 0).map(m => <th key={m.month} className="th text-center">{m.month_name}</th>)}
                  <th className="th text-right">Σύνολο</th>
                </tr>
              </thead>
              <tbody>
                {agents.map(agent => {
                  const agentMonths = data.filter(m => m.total > 0).map(m => {
                    const a = m.agents.find(x => x.agent === agent);
                    return a?.total || 0;
                  });
                  const total = agentMonths.reduce((s, v) => s + v, 0);
                  return (
                    <tr key={agent} className="tr">
                      <td className="td font-semibold text-slate-800">{agent}</td>
                      {agentMonths.map((v, i) => (
                        <td key={i} className="td text-center text-xs">
                          {v > 0 ? <span className="badge-blue">{v}</span> : <span className="text-slate-200">—</span>}
                        </td>
                      ))}
                      <td className="td text-right font-bold text-indigo-600">{total}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!hasData && (
        <div className="card p-12 text-center text-slate-400">
          <div className="text-3xl mb-2">📊</div>
          <div className="font-medium text-slate-500 mb-1">Δεν υπάρχουν ανοικτές υποθέσεις.</div>
          <div className="text-sm">Προσθέστε συμφωνίες από τη σελίδα Συμφωνίες.</div>
        </div>
      )}
    </div>
  );
}

function TabServiceTrend() {
  const [serviceTypes, setServiceTypes] = useState([]);
  const [selected, setSelected] = useState('');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/reports/service-trend').then(r => {
      // Normalize: the endpoint might return an array of strings or objects
      const types = Array.isArray(r.data)
        ? r.data.map(item => (typeof item === 'string' ? item : (item.service_type || item.name || String(item))))
        : [];
      setServiceTypes(types);
      if (types.length) setSelected(types[0]);
    }).catch(() => { setServiceTypes([]); });
  }, []);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    setError('');
    api.get(`/reports/service-trend?service_type=${encodeURIComponent(selected)}`)
      .then(r => {
        setData(Array.isArray(r.data) ? r.data.map(row => ({
          ...row,
          count: parseInt(row.count || 0),
          total: parseFloat(row.total || 0),
          total_application: parseFloat(row.total_application || 0),
          total_implementation: parseFloat(row.total_implementation || 0)
        })) : []);
      })
      .catch(e => { setError(e.response?.data?.error || 'Σφάλμα φόρτωσης δεδομένων'); setData([]); })
      .finally(() => setLoading(false));
  }, [selected]);

  const fmt2 = n => Math.round(n).toLocaleString('el-GR') + ' €';
  const totalCount = data.reduce((s, r) => s + r.count, 0);
  const totalAmount = data.reduce((s, r) => s + r.total_application, 0);
  const avgAmount = totalCount > 0 ? totalAmount / totalCount : 0;

  return (
    <div className="space-y-6">
      <div className="filter-bar">
        <select className="input w-64" value={selected} onChange={e => setSelected(e.target.value)}>
          <option value="">— Επιλογή Υπηρεσίας —</option>
          {serviceTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {!loading && !error && data.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Σύνολο Συμφωνιών', value: totalCount, suffix: '' },
              { label: 'Συνολικό Ποσό', value: fmt2(totalAmount), suffix: '' },
              { label: 'Μέσος Όρος/Συμφωνία', value: fmt2(avgAmount), suffix: '' }
            ].map(({ label, value }) => (
              <div key={label} className="card p-4">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</div>
                <div className="text-xl font-black text-indigo-600">{value}</div>
              </div>
            ))}
          </div>

          <div className="card p-6">
            <h2 className="section-title">Εξέλιξη Συμφωνιών — {selected}</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => v.toLocaleString('el-GR')} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(value, name) => name === 'Αρ. Συμφωνιών' ? value : Math.round(value).toLocaleString('el-GR') + ' €'} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="left" dataKey="total_application" name="Σύνολο Ποσών" fill="#6366f1" radius={[4,4,0,0]} maxBarSize={40} />
                <Bar yAxisId="right" dataKey="count" name="Αρ. Συμφωνιών" fill="#10b981" radius={[4,4,0,0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    {['Περίοδος','Πλήθος','Σύνολο Αίτησης','Μ.Ο. Αίτησης','Σύνολο Υλοποίησης','Μ.Ο. Υλοποίησης'].map(h => (
                      <th key={h} className="th">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map(r => (
                    <tr key={r.period} className="tr">
                      <td className="td font-semibold text-slate-700">{r.period}</td>
                      <td className="td text-center"><span className="badge-blue">{r.count}</span></td>
                      <td className="td text-right font-medium text-slate-700">{fmt2(r.total_application)}</td>
                      <td className="td text-right text-slate-500">{r.count > 0 ? fmt2(r.total_application / r.count) : '—'}</td>
                      <td className="td text-right font-medium text-slate-700">{r.total_implementation > 0 ? fmt2(r.total_implementation) : '—'}</td>
                      <td className="td text-right text-slate-500">{r.count > 0 && r.total_implementation > 0 ? fmt2(r.total_implementation / r.count) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {loading && (
        <div className="card p-12 text-center text-slate-400">Φόρτωση...</div>
      )}
      {!loading && error && (
        <div className="card p-12 text-center text-rose-400">{error}</div>
      )}
      {!loading && !error && data.length === 0 && selected && (
        <div className="card p-12 text-center text-slate-400">
          <div className="text-3xl mb-2">📉</div>
          Δεν βρέθηκαν δεδομένα για αυτή την υπηρεσία. Δοκιμάστε άλλη επιλογή.
        </div>
      )}
      {!loading && !error && data.length === 0 && !selected && (
        <div className="card p-12 text-center text-slate-400">Επιλέξτε υπηρεσία για να δείτε στατιστικά.</div>
      )}
    </div>
  );
}

function AchievementBar({ pct }) {
  const capped = Math.min(pct, 100);
  const color = pct >= 100 ? 'bg-emerald-500' : pct >= 75 ? 'bg-amber-400' : 'bg-rose-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-slate-100 rounded-full h-1.5 min-w-[40px]">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${capped}%` }} />
      </div>
      <span className={`text-xs font-bold w-10 text-right ${pct >= 100 ? 'text-emerald-600' : pct >= 75 ? 'text-amber-600' : 'text-rose-600'}`}>
        {pct > 0 ? `${Math.round(pct)}%` : '—'}
      </span>
    </div>
  );
}

// Settings modal — per-employee target config + visibility toggle
function PayrollSettingsModal({ employees, onClose, onSaved }) {
  const [settings, setSettings] = useState({});
  const [saving, setSaving] = useState(null);

  // Initialise: pre-populate from existing settings on each employee record
  useEffect(() => {
    const init = {};
    for (const d of employees) {
      const s = d.settings;
      init[d.agent] = {
        id: s?.id ?? null,
        visible: s ? s.visible : true,
        target_type: s?.target_type ?? 'multiplier',
        target_value: s?.target_value ?? 4.2,
        overachievement_rate: s?.overachievement_rate ?? 10,
      };
    }
    setSettings(init);
  }, [employees]);

  // Also load hidden employees that don't appear in data (they're filtered out)
  useEffect(() => {
    api.get('/payroll-settings').then(r => {
      setSettings(prev => {
        const next = { ...prev };
        for (const s of r.data) {
          if (!next[s.employee_name]) {
            next[s.employee_name] = { id: s.id, visible: s.visible, target_type: s.target_type, target_value: parseFloat(s.target_value), overachievement_rate: parseFloat(s.overachievement_rate ?? 10) };
          }
        }
        return next;
      });
    }).catch(() => {});
  }, []);

  const update = (agent, patch) => setSettings(prev => ({ ...prev, [agent]: { ...prev[agent], ...patch } }));

  const save = async (agent) => {
    setSaving(agent);
    try {
      const s = settings[agent];
      await api.post('/payroll-settings', {
        employee_name: agent,
        visible: s.visible,
        target_type: s.target_type,
        target_value: parseFloat(s.target_value) || 4.2,
      });
    } catch (e) {
      alert('Σφάλμα αποθήκευσης: ' + (e.response?.data?.error || e.message));
    } finally {
      setSaving(null);
    }
  };

  const saveAll = async () => {
    setSaving('__all__');
    try {
      await Promise.all(Object.keys(settings).map(agent =>
        api.post('/payroll-settings', {
          employee_name: agent,
          visible: settings[agent].visible,
          target_type: settings[agent].target_type,
          target_value: parseFloat(settings[agent].target_value) || 4.2,
          overachievement_rate: parseFloat(settings[agent].overachievement_rate) || 0,
        })
      ));
      onSaved();
      onClose();
    } catch (e) {
      alert('Σφάλμα αποθήκευσης');
    } finally {
      setSaving(null);
    }
  };

  const agents = Object.keys(settings).sort((a, b) => a.localeCompare(b, 'el'));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-black text-slate-800 text-lg">Ρυθμίσεις Στόχων Μισθοδοσίας</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl font-bold">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 p-4 space-y-2">
          {agents.map(agent => {
            const s = settings[agent] || { visible: true, target_type: 'multiplier', target_value: 4.2 };
            return (
              <div key={agent} className={`border rounded-xl p-3 transition-colors ${s.visible ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 opacity-60'}`}>
                <div className="flex flex-wrap items-center gap-3">
                  {/* Visible toggle */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={s.visible}
                      onChange={e => update(agent, { visible: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-300 text-primary-600" />
                    <span className="font-semibold text-slate-700 text-sm">{agent}</span>
                  </label>

                  {s.visible && (
                    <>
                      {/* Target type */}
                      <select className="input text-xs py-1 px-2 h-7 w-36"
                        value={s.target_type}
                        onChange={e => update(agent, { target_type: e.target.value })}>
                        <option value="multiplier">×Πολλαπλασιαστής</option>
                        <option value="fixed">Σταθερό Ποσό €</option>
                      </select>

                      {/* Target value */}
                      <input type="number" step={s.target_type === 'multiplier' ? '0.1' : '50'}
                        min="0" className="input text-xs py-1 px-2 h-7 w-24"
                        value={s.target_value}
                        onChange={e => update(agent, { target_value: e.target.value })} />

                      <span className="text-xs text-slate-400">
                        {s.target_type === 'multiplier' ? `× κόστος μισθοδοσίας` : `€ / μήνα`}
                      </span>

                      {/* Over-achievement commission rate */}
                      <span className="text-xs text-slate-400 ml-2">|</span>
                      <input type="number" step="0.5" min="0" max="50"
                        className="input text-xs py-1 px-2 h-7 w-16"
                        value={s.overachievement_rate ?? 10}
                        onChange={e => update(agent, { overachievement_rate: e.target.value })} />
                      <span className="text-xs text-slate-400">% μπόνους υπέρβασης</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
          <button className="btn-secondary" onClick={onClose}>Ακύρωση</button>
          <button className="btn-primary" onClick={saveAll} disabled={saving === '__all__'}>
            {saving === '__all__' ? 'Αποθήκευση...' : 'Αποθήκευση Ρυθμίσεων'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TabPayroll() {
  const [payrollYears, setPayrollYears] = useState([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState([]);
  const [allEmployees, setAllEmployees] = useState([]); // all incl. hidden, for settings modal
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editTarget, setEditTarget] = useState(null); // { agent, monthKey, value }

  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonthIdx = today.getMonth(); // 0-based: July = 6

  const saveTargetOverride = async () => {
    if (!editTarget) return;
    const { agent, monthKey, value } = editTarget;
    setEditTarget(null);
    try {
      await api.patch('/payroll-settings/override', {
        employee_name: agent,
        year_month: monthKey,
        value: value === '' ? null : parseFloat(value),
      });
      loadData(year);
    } catch (e) { console.error('Override save failed:', e); }
  };

  const clearOverride = async (agent, monthKey) => {
    try {
      await api.patch('/payroll-settings/override', { employee_name: agent, year_month: monthKey, value: null });
      loadData(year);
    } catch (e) { console.error('Override clear failed:', e); }
  };

  const MONTH_NAMES = ['Ιαν','Φεβ','Μαρ','Απρ','Μαι','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];
  const BORDER_COLORS = ['border-indigo-400','border-emerald-400','border-amber-400','border-rose-400','border-cyan-400','border-purple-400'];

  const loadData = (y) => {
    if (!y) return;
    setLoading(true);
    // Fetch visible data + all settings (for modal)
    Promise.all([
      api.get(`/reports/payroll?year=${y}`),
      api.get('/payroll-settings'),
    ]).then(([r, sr]) => {
      const visible = r.data || [];
      setData(visible);
      // Build allEmployees: visible employees + hidden ones from settings
      const hiddenSettings = (sr.data || []).filter(s => !s.visible);
      const hiddenRecords = hiddenSettings
        .filter(s => !visible.find(d => d.agent.toUpperCase() === s.employee_name.toUpperCase()))
        .map(s => ({
          agent: s.employee_name,
          monthly: [],
          total: 0, total_target: 0, total_sales: 0,
          settings: { id: s.id, visible: false, target_type: s.target_type, target_value: parseFloat(s.target_value) },
          streak: { max: 0, current: 0 }
        }));
      setAllEmployees([...visible, ...hiddenRecords]);
    })
    .catch(() => { setData([]); setAllEmployees([]); })
    .finally(() => setLoading(false));
  };

  useEffect(() => {
    api.get('/reports/payroll-years').then(r => {
      const ys = r.data || [];
      setPayrollYears(ys);
      if (ys.length > 0) { setYear(ys[0]); loadData(ys[0]); }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (year && payrollYears.includes(year)) loadData(year);
  }, [year]);

  const grandPayroll = data.reduce((s, d) => s + d.total, 0);
  const grandTarget = data.reduce((s, d) => s + d.total_target, 0);
  const grandSales = data.reduce((s, d) => s + d.total_sales, 0);
  const grandPct = grandTarget > 0 ? (grandSales / grandTarget) * 100 : 0;

  return (
    <div className="space-y-6">
      {showSettings && (
        <PayrollSettingsModal
          employees={allEmployees}
          onClose={() => setShowSettings(false)}
          onSaved={() => loadData(year)}
        />
      )}

      <div className="filter-bar">
        <select className="input w-28" value={year} onChange={e => setYear(+e.target.value)}>
          {(payrollYears.length > 0 ? payrollYears : [year]).map(y => <option key={y}>{y}</option>)}
        </select>
        <button className="btn-ghost btn-sm flex items-center gap-1.5" onClick={() => setShowSettings(true)}>
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-slate-500">
            <path fillRule="evenodd" d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.206-1.25l1.18-2.045a1 1 0 0 1 1.187-.447l1.598.54A6.993 6.993 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd"/>
          </svg>
          Ρυθμίσεις Στόχων
        </button>
      </div>

      {loading && <div className="card p-12 text-center text-slate-400">Φόρτωση...</div>}

      {!loading && data.length > 0 && (
        <>
          {/* Overview stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Σύνολο Μισθοδοσίας" value={fmt(grandPayroll)} color="border-slate-400" />
            <StatCard label="Σύνολο Στόχων" value={fmt(grandTarget)} color="border-amber-400" />
            <StatCard label="Είσπραξη" value={fmt(grandSales)} color={grandSales >= grandTarget ? 'border-emerald-400' : 'border-rose-400'} />
            <div className="card p-5 border-l-4 border-indigo-400">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Επίτευξη Στόχου</div>
              <div className={`text-2xl font-black ${grandPct >= 100 ? 'text-emerald-600' : grandPct >= 75 ? 'text-amber-600' : 'text-rose-600'}`}>
                {grandTarget > 0 ? `${Math.round(grandPct)}%` : '—'}
              </div>
            </div>
          </div>

          {/* Per-employee cards */}
          {data.map((d, di) => {
            const pct = d.total_target > 0 ? (d.total_sales / d.total_target) * 100 : 0;
            const achieved = d.total_sales >= d.total_target;
            const streak = d.streak || { max: 0, current: 0 };
            const s = d.settings;
            const commRate = parseFloat(d.settings?.overachievement_rate ?? 0);
            const targetLabel = (s?.target_type === 'fixed'
              ? `Σταθερός στόχος: ${Math.round(s.target_value)}€/μήνα`
              : `×${s?.target_value ?? 4.2} × Μισθοδοσία`) +
              (commRate > 0 ? ` · ${commRate}% μπόνους υπέρβασης` : '');

            return (
              <div key={d.agent} className="card overflow-hidden">
                {/* Header */}
                <div className={`px-6 py-4 border-b border-slate-100 flex flex-wrap items-start gap-4 border-l-4 ${BORDER_COLORS[di % BORDER_COLORS.length]}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-black text-slate-800 text-base">{d.agent}</h3>
                      {/* Streak badges */}
                      {streak.current >= 3 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-300">
                          🏆 {streak.current} μήνες σερί
                        </span>
                      )}
                      {streak.current === 1 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          ⭐ Τελευταίος μήνας στόχος
                        </span>
                      )}
                      {streak.current === 2 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-300">
                          ⭐⭐ 2 μήνες σερί
                        </span>
                      )}
                      <span className="text-xs text-slate-400 italic">{targetLabel}</span>
                    </div>
                    <div className="flex flex-wrap gap-4 mt-1 text-xs text-slate-500">
                      <span>Κόστος: <strong className="text-slate-700">{fmt(d.total)}</strong></span>
                      <span>Στόχος: <strong className="text-amber-600">{fmt(d.total_target)}</strong></span>
                      <span>Είσπραξη: <strong className={achieved ? 'text-emerald-600' : 'text-rose-600'}>{fmt(d.total_sales)}</strong></span>
                      <span>Διαφορά: <strong className={d.total_sales - d.total_target >= 0 ? 'text-emerald-600' : 'text-rose-600'}>{d.total_sales - d.total_target >= 0 ? '+' : ''}{fmt(d.total_sales - d.total_target)}</strong></span>
                      {d.total_commission > 0 && (
                        <span>Μπόνους Υπέρβασης: <strong className="text-violet-600">{fmt(d.total_commission)}</strong></span>
                      )}
                    </div>
                  </div>
                  <div className="w-32 mt-1">
                    <AchievementBar pct={pct} />
                  </div>
                </div>

                {/* Monthly table */}
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="th w-8"></th>
                        <th className="th">Μήνας</th>
                        <th className="th text-right">Κόστος Μισθοδοσίας</th>
                        <th className="th text-right">Στόχος</th>
                        <th className="th text-right">Είσπραξη</th>
                        <th className="th text-right min-w-[120px]">Επίτευξη</th>
                        <th className="th text-right">Διαφορά</th>
                        {commRate > 0 && <th className="th text-right text-violet-600">Μπόνους {commRate}%</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {d.monthly.map((m, i) => {
                        const isFuture = year === currentYear && i > currentMonthIdx;
                        const monthKey = `${year}-${m.month}`;
                        const hasOverride = d.settings?.monthly_overrides?.[monthKey] != null;
                        const hasData = m.amount !== 0 || m.sales !== 0 || m.target !== 0;
                        if (!hasData && !isFuture) return (
                          <tr key={m.month} className="tr opacity-25">
                            <td className="td"></td>
                            <td className="td text-slate-400">{MONTH_NAMES[i]} {year}</td>
                            <td className="td text-right text-slate-300">—</td>
                            <td className="td text-right">
                              {editTarget?.agent === d.agent && editTarget?.monthKey === monthKey ? (
                                <input autoFocus type="number" className="w-24 text-right text-sm border border-amber-400 rounded px-2 py-0.5 outline-none"
                                  value={editTarget.value}
                                  onChange={e => setEditTarget(prev => ({ ...prev, value: e.target.value }))}
                                  onBlur={saveTargetOverride}
                                  onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditTarget(null); }} />
                              ) : (
                                <span className="text-slate-300 cursor-pointer hover:text-amber-400 text-sm"
                                  title="Κλικ για ορισμό στόχου"
                                  onClick={() => setEditTarget({ agent: d.agent, monthKey, value: '' })}>—</span>
                              )}
                            </td>
                            <td className="td text-right text-slate-300">—</td>
                            <td className="td text-right text-slate-300">—</td>
                            <td className="td text-right text-slate-300">—</td>
                            {commRate > 0 && <td className="td text-right text-slate-300">—</td>}
                          </tr>
                        );
                        const monthPct = m.target > 0 ? (m.sales / m.target) * 100 : 0;
                        const diff = m.sales - m.target;
                        const hit = m.target > 0 && m.sales >= m.target;
                        return (
                          <tr key={m.month} className={`tr ${hit ? 'bg-emerald-50/40' : ''} ${isFuture ? 'opacity-40' : ''}`}>
                            <td className="td text-center text-base leading-none">
                              {hit ? '⭐' : ''}
                            </td>
                            <td className="td font-semibold text-slate-700">{MONTH_NAMES[i]} {year}</td>
                            <td className="td text-right">
                              {m.amount !== 0
                                ? <span className={`font-bold ${m.amount < 0 ? 'text-rose-600' : 'text-indigo-600'}`}>{fmt(m.amount)}</span>
                                : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="td text-right">
                              {isFuture ? (
                                <span className="text-slate-300">—</span>
                              ) : editTarget?.agent === d.agent && editTarget?.monthKey === monthKey ? (
                                <input autoFocus type="number" className="w-24 text-right text-sm border border-amber-400 rounded px-2 py-0.5 outline-none"
                                  value={editTarget.value}
                                  onChange={e => setEditTarget(prev => ({ ...prev, value: e.target.value }))}
                                  onBlur={saveTargetOverride}
                                  onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditTarget(null); }} />
                              ) : m.target > 0 ? (
                                <span className="flex items-center justify-end gap-1 group">
                                  {hasOverride && (
                                    <button className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-500 text-xs leading-none px-0.5"
                                      title="Επαναφορά σε υπολογισμένο στόχο"
                                      onClick={() => clearOverride(d.agent, monthKey)}>×</button>
                                  )}
                                  <span className={`cursor-pointer font-semibold ${hasOverride ? 'text-purple-600 underline decoration-dotted underline-offset-2' : 'text-amber-600'} hover:opacity-75`}
                                    title={hasOverride ? 'Προσαρμοσμένος στόχος — κλικ για αλλαγή' : 'Κλικ για προσαρμοσμένο στόχο'}
                                    onClick={() => setEditTarget({ agent: d.agent, monthKey, value: Math.round(m.target) })}>
                                    {fmt(m.target)}
                                  </span>
                                </span>
                              ) : (
                                <span className="text-slate-300 cursor-pointer hover:text-amber-400 text-sm"
                                  title="Κλικ για ορισμό στόχου"
                                  onClick={() => setEditTarget({ agent: d.agent, monthKey, value: '' })}>—</span>
                              )}
                            </td>
                            <td className="td text-right">
                              {m.sales > 0
                                ? <span className={`font-bold ${hit ? 'text-emerald-600' : 'text-slate-700'}`}>{fmt(m.sales)}</span>
                                : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="td text-right">
                              {m.target > 0 && !isFuture ? <AchievementBar pct={monthPct} /> : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="td text-right">
                              {m.target > 0 && !isFuture
                                ? <span className={`font-bold text-sm ${diff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{diff >= 0 ? '+' : ''}{fmt(diff)}</span>
                                : <span className="text-slate-300">—</span>}
                            </td>
                            {commRate > 0 && (
                              <td className="td text-right">
                                {m.commission > 0
                                  ? <span className="font-bold text-violet-600">{fmt(m.commission)}</span>
                                  : <span className="text-slate-300">—</span>}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                      <tr className="bg-slate-50 border-t-2 border-slate-200">
                        <td className="td"></td>
                        <td className="td font-black text-slate-800 uppercase text-xs tracking-wide">ΣΥΝΟΛΟ {year}</td>
                        <td className="td text-right font-black text-indigo-700">{fmt(d.total)}</td>
                        <td className="td text-right font-black text-amber-600">{fmt(d.total_target)}</td>
                        <td className="td text-right font-black">
                          <span className={d.total_sales >= d.total_target ? 'text-emerald-700' : 'text-slate-700'}>{fmt(d.total_sales)}</span>
                        </td>
                        <td className="td text-right">
                          {d.total_target > 0 ? <AchievementBar pct={pct} /> : '—'}
                        </td>
                        <td className="td text-right font-black">
                          <span className={d.total_sales - d.total_target >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                            {d.total_sales - d.total_target >= 0 ? '+' : ''}{fmt(d.total_sales - d.total_target)}
                          </span>
                        </td>
                        {commRate > 0 && (
                          <td className="td text-right font-black">
                            <span className="text-violet-700">{d.total_commission > 0 ? fmt(d.total_commission) : '—'}</span>
                          </td>
                        )}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </>
      )}

      {!loading && data.length === 0 && (
        <div className="card p-12 text-center text-slate-400">
          <div className="text-3xl mb-2">💰</div>
          <div className="font-medium text-slate-500 mb-1">Δεν υπάρχουν εγγραφές ΜΙΣΘΟΔΟΣΙΑ-ΕΡΓΑΤΙΚΑ για {year}.</div>
          <div className="text-sm">Προσθέστε έξοδα με κατηγορία «ΜΙΣΘΟΔΟΣΙΑ-ΕΡΓΑΤΙΚΑ» και ονομασία υπαλλήλου στο πεδίο Προμηθευτής.</div>
        </div>
      )}
    </div>
  );
}

const TABS = [
  { id: 'overview', label: 'Επισκόπηση' },
  { id: 'top-customers', label: 'Κορυφαίοι Πελάτες' },
  { id: 'accountants', label: 'Αναφορά Λογιστών' },
  { id: 'service-trend', label: 'Ανά Υπηρεσία' },
  { id: 'payroll', label: 'Μισθοδοσία' },
];

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedYears, setSelectedYears] = useState([new Date().getFullYear()]);
  const [selectedMonths, setSelectedMonths] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [monthly, setMonthly] = useState([]);
  const [byService, setByService] = useState([]);
  const [byAgent, setByAgent] = useState([]);
  const [byExpCat, setByExpCat] = useState([]);
  const [summary, setSummary] = useState(null);
  const [availableYears, setAvailableYears] = useState([]);
  const [serviceTypes, setServiceTypes] = useState([]);

  useEffect(() => {
    api.get('/reports/available-years').then(r => {
      const years = r.data || [];
      setAvailableYears(years);
      if (years.length > 0 && !years.includes(selectedYears[0])) setSelectedYears([years[0]]);
    }).catch(() => {});
    api.get('/lists?list_type=ΕΙΔΟΣ_ΥΠΗΡΕΣΙΑΣ&active_only=true').then(r => setServiceTypes(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (activeTab !== 'overview') return;
    const buildQ = (base) => {
      const params = new URLSearchParams(base);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      return params.toString();
    };
    const ymParams = new URLSearchParams();
    if (selectedYears.length === 1) ymParams.set('year', selectedYears[0]);
    else if (selectedYears.length > 1) ymParams.set('years', selectedYears.join(','));
    if (selectedMonths.length === 1) ymParams.set('month', selectedMonths[0]);
    else if (selectedMonths.length > 1) ymParams.set('months', selectedMonths.join(','));
    const q = ymParams.toString();
    const chartYear = selectedYears[0] || new Date().getFullYear();
    Promise.allSettled([
      api.get(`/reports/monthly?year=${chartYear}`),
      api.get(`/reports/by-service?${buildQ(q)}`),
      api.get(`/reports/by-agent?${buildQ(q)}`),
      api.get(`/reports/expenses-by-category?${buildQ(q)}`),
      api.get(`/reports/summary?${buildQ(q)}`)
    ]).then(([m, sv, ag, ec, sm]) => {
      if (m.status === 'fulfilled') {
        const monthData = m.value.data.map(d => ({ ...d, name: d.month_name?.slice(0, 3) || '' }));
        setMonthly(monthData);
        if (sm.status === 'fulfilled' && sm.value.data.income === 0 && sm.value.data.income_count === 0 && selectedYears[0] === new Date().getFullYear()) {
          setSelectedYears([selectedYears[0] - 1]);
          return;
        }
      }
      if (sv.status === 'fulfilled') setByService(sv.value.data);
      if (ag.status === 'fulfilled') setByAgent(ag.value.data);
      if (ec.status === 'fulfilled') setByExpCat(ec.value.data);
      if (sm.status === 'fulfilled') setSummary(sm.value.data);
    });
  }, [selectedYears, selectedMonths, dateFrom, dateTo, activeTab]);

  const years = availableYears.length > 0
    ? availableYears
    : Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i);
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
          selectedYears={selectedYears} setSelectedYears={setSelectedYears}
          selectedMonths={selectedMonths} setSelectedMonths={setSelectedMonths}
          years={years}
          monthly={monthly} byService={byService} byAgent={byAgent}
          byExpCat={byExpCat} summary={summary}
          dateFrom={dateFrom} setDateFrom={setDateFrom}
          dateTo={dateTo} setDateTo={setDateTo}
          serviceTypes={serviceTypes}
        />
      )}
      {activeTab === 'top-customers' && <TabTopCustomers years={years} />}
      {activeTab === 'accountants' && <TabAccountants years={years} />}
      {activeTab === 'service-trend' && <TabServiceTrend />}
      {activeTab === 'payroll' && <TabPayroll />}
    </div>
  );
}
