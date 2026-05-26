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

function TabOverview({ selectedYears, setSelectedYears, selectedMonths, setSelectedMonths, years, monthly, byService, byAgent, byExpCat, summary, dateFrom, setDateFrom, dateTo, setDateTo }) {
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

const TABS = [
  { id: 'overview', label: 'Επισκόπηση' },
  { id: 'top-customers', label: 'Κορυφαίοι Πελάτες' },
  { id: 'accountants', label: 'Αναφορά Λογιστών' },
  { id: 'service-trend', label: 'Ανά Υπηρεσία' },
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

  useEffect(() => {
    api.get('/reports/available-years').then(r => {
      const years = r.data || [];
      setAvailableYears(years);
      if (years.length > 0 && !years.includes(selectedYears[0])) setSelectedYears([years[0]]);
    }).catch(() => {});
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
        />
      )}
      {activeTab === 'top-customers' && <TabTopCustomers years={years} />}
      {activeTab === 'accountants' && <TabAccountants years={years} />}
      {activeTab === 'service-trend' && <TabServiceTrend />}
    </div>
  );
}
