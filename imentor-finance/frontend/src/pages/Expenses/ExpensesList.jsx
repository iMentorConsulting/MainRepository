import { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../../api/client';
import Modal from '../../components/Modal';
import ExpensesForm from './ExpensesForm';
import toast from 'react-hot-toast';

function MultiSelectDropdown({ label, options, selected, onChange, getKey, getLabel }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const allSelected = selected.length === 0;
  const displayLabel = allSelected
    ? label
    : selected.length === 1
      ? getLabel(options.find(o => getKey(o) === selected[0]) || {})
      : selected.map(k => getLabel(options.find(o => getKey(o) === k) || {})).join(', ');

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
        <div className="absolute z-50 top-full mt-1 left-0 min-w-[160px] bg-white border border-slate-200 rounded-xl shadow-lg py-1 max-h-64 overflow-y-auto">
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

const now = new Date();
const fmt = n => n != null && n !== '' ? Number(n).toLocaleString('el-GR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €' : '—';
const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

function SortTh({ label, field, sort, onSort, className = '' }) {
  const active = sort.field === field;
  return (
    <th className={`th cursor-pointer select-none group ${className}`} onClick={() => onSort(field)}>
      <div className="flex items-center gap-1">
        {label}
        <span className={`text-[10px] transition-opacity ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-40'}`}>
          {active && sort.dir === 'ASC' ? '↑' : '↓'}
        </span>
      </div>
    </th>
  );
}

const PIE_COLORS = ['#f43f5e', '#f97316', '#eab308', '#10b981', '#6366f1', '#a855f7', '#06b6d4', '#0ea5e9'];

function CategorySummary({ byCategory }) {
  const [expanded, setExpanded] = useState(new Set());

  const grouped = {};
  for (const r of byCategory || []) {
    const s = parseFloat(r.sum || 0);
    if (!s) continue;
    const cat = r.category || 'Άγνωστο';
    if (!grouped[cat]) grouped[cat] = { total: 0, suppliers: {} };
    grouped[cat].total += s;
    const sup = r.supplier || 'Χωρίς προμηθευτή';
    grouped[cat].suppliers[sup] = (grouped[cat].suppliers[sup] || 0) + s;
  }

  const cats = Object.entries(grouped).sort((a, b) => b[1].total - a[1].total);
  if (cats.length === 0) return null;
  const grandTotal = cats.reduce((s, [, v]) => s + v.total, 0);

  const toggle = cat => setExpanded(s => { const n = new Set(s); n.has(cat) ? n.delete(cat) : n.add(cat); return n; });

  const pieData = cats.map(([name, { total }]) => ({ name, value: total }));

  const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
    if (percent < 0.04) return null;
    const RADIAN = Math.PI / 180;
    const r = innerRadius + (outerRadius - innerRadius) * 0.55;
    return (
      <text x={cx + r * Math.cos(-midAngle * RADIAN)} y={cy + r * Math.sin(-midAngle * RADIAN)}
        fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight="bold">
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <h3 className="section-title mb-0">Σύνολο ανά Κατηγορία</h3>
        <span className="text-sm font-bold text-rose-600">{fmt(grandTotal)}</span>
      </div>
      <div className="flex flex-col lg:flex-row">
        <div className="flex-1 min-w-0 divide-y divide-slate-50">
          {cats.map(([cat, { total, suppliers }], idx) => {
            const pct = grandTotal > 0 ? (total / grandTotal) * 100 : 0;
            const isOpen = expanded.has(cat);
            return (
              <div key={cat}>
                <button className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors text-left group"
                  onClick={() => toggle(cat)}>
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PIE_COLORS[idx % PIE_COLORS.length] }} />
                  <div className="flex-1 flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium text-slate-700 truncate">{cat}</span>
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">{pct.toFixed(0)}%</span>
                  <span className="text-sm font-bold text-rose-600 w-24 text-right shrink-0">{fmt(total)}</span>
                  <svg viewBox="0 0 16 16" fill="currentColor" className={`w-3.5 h-3.5 text-slate-400 transition-transform shrink-0 ${isOpen ? 'rotate-90' : ''}`}>
                    <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L9.19 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd"/>
                  </svg>
                </button>
                {isOpen && (
                  <div className="bg-slate-50 border-t border-slate-100">
                    {Object.entries(suppliers).sort((a, b) => b[1] - a[1]).map(([sup, amt]) => (
                      <div key={sup} className="flex items-center justify-between px-8 py-1.5">
                        <span className="text-xs text-slate-500">{sup}</span>
                        <span className="text-xs font-semibold text-slate-700">{fmt(amt)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="w-full lg:w-64 shrink-0 flex items-center justify-center p-4 border-t lg:border-t-0 lg:border-l border-slate-100">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" outerRadius={95} dataKey="value"
                labelLine={false} label={renderCustomLabel}>
                {pieData.map((_, idx) => (
                  <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v, name) => [fmt(v), name]} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export default function ExpensesList() {
  const [data, setData] = useState({ total: 0, data: [] });
  const [filters, setFilters] = useState({
    category: '', search: '', page: 1
  });
  const [selectedYears, setSelectedYears] = useState([String(now.getFullYear())]);
  const [selectedMonths, setSelectedMonths] = useState([String(now.getMonth() + 1).padStart(2, '0')]);
  const [sort, setSort] = useState({ field: 'date', dir: 'DESC' });
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [hideNoAmount, setHideNoAmount] = useState(true);
  const [modal, setModal] = useState({ open: false, record: null });
  const [deleteId, setDeleteId] = useState(null);
  const [categories, setCategories] = useState([]);

  const load = useCallback(() => {
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''));
    params.sort_field = sort.field;
    params.sort_dir = sort.dir;
    if (selectedYears.length === 1) params.year = selectedYears[0];
    else if (selectedYears.length > 1) params.years = selectedYears.join(',');
    if (selectedMonths.length === 1) params.month = selectedMonths[0];
    else if (selectedMonths.length > 1) params.months = selectedMonths.join(',');
    if (hideNoAmount) params.hide_no_amount = 'true';
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    params.limit = 200;
    api.get('/expenses', { params }).then(r => setData(r.data));
  }, [filters, selectedYears, selectedMonths, sort, hideNoAmount, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get('/lists?list_type=ΚΑΤΗΓΟΡΙΕΣ_ΕΞΟΔΩΝ&active_only=true').then(r => setCategories(r.data.map(x => x.value)));
  }, []);

  const handleSort = field => {
    setSort(s => s.field === field ? { field, dir: s.dir === 'DESC' ? 'ASC' : 'DESC' } : { field, dir: 'DESC' });
    setFilters(f => ({ ...f, page: 1 }));
  };

  const handleDelete = async id => {
    try { await api.delete(`/expenses/${id}`); toast.success('Διαγράφηκε'); setDeleteId(null); load(); }
    catch { toast.error('Σφάλμα διαγραφής'); }
  };

  const handleDuplicate = (row) => {
    const copy = { ...row };
    delete copy.id;
    copy.date = new Date().toISOString().slice(0, 10);
    setModal({ open: true, record: copy, isDuplicate: true });
  };

  const yearOptions = Array.from({ length: 8 }, (_, i) => ({ value: String(now.getFullYear() - i), label: String(now.getFullYear() - i) }));
  const monthOptions = [
    { value: '01', label: 'Ιαν' }, { value: '02', label: 'Φεβ' }, { value: '03', label: 'Μαρ' },
    { value: '04', label: 'Απρ' }, { value: '05', label: 'Μαι' }, { value: '06', label: 'Ιουν' },
    { value: '07', label: 'Ιουλ' }, { value: '08', label: 'Αυγ' }, { value: '09', label: 'Σεπ' },
    { value: '10', label: 'Οκτ' }, { value: '11', label: 'Νοε' }, { value: '12', label: 'Δεκ' },
  ];
  const handleExport = async () => {
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''));
      if (selectedYears.length === 1) params.year = selectedYears[0];
      else if (selectedYears.length > 1) params.years = selectedYears.join(',');
      if (selectedMonths.length === 1) params.month = selectedMonths[0];
      else if (selectedMonths.length > 1) params.months = selectedMonths.join(',');
      if (hideNoAmount) params.hide_no_amount = 'true';
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      params.limit = 5000;
      params.page = 1;
      const r = await api.get('/expenses', { params });
      const rows = r.data.data.map(row => ({
        'Ημερομηνία': row.date || '',
        'Κατηγορία': row.category || '',
        'Προμηθευτής': row.supplier || '',
        'Υπηρεσία': row.related_service || '',
        'Αιτιολογία': row.description || '',
        'Ποσό': row.amount != null ? Number(row.amount) : '',
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Έξοδα');
      XLSX.writeFile(wb, `exoda_${new Date().toISOString().slice(0,10)}.xlsx`);
    } catch {
      toast.error('Σφάλμα εξαγωγής');
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Έξοδα</h1>
          <p className="page-sub">{data.total.toLocaleString('el-GR')} εγγραφές σύνολο</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button className="btn-ghost btn-sm text-rose-600 hover:bg-rose-50 flex-1 sm:flex-initial justify-center" onClick={async () => {
            if (!window.confirm('Διαγραφή ΟΛΩΝ των εγγραφών με 0€;')) return;
            try {
              const r = await api.delete('/expenses/zero');
              toast.success(`Διαγράφηκαν ${r.data.deleted} εγγραφές με 0€`);
              load();
            } catch (e) { toast.error('Σφάλμα διαγραφής'); }
          }}>
            Διαγρ. 0€
          </button>
          <button className="btn-ghost btn-sm flex-1 sm:flex-initial justify-center" onClick={handleExport}>
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M10 3a.75.75 0 0 1 .75.75v8.69l2.22-2.22a.75.75 0 1 1 1.06 1.06l-3.5 3.5a.75.75 0 0 1-1.06 0l-3.5-3.5a.75.75 0 1 1 1.06-1.06l2.22 2.22V3.75A.75.75 0 0 1 10 3ZM5.75 16a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5h-8.5Z" clipRule="evenodd"/></svg>
            Excel
          </button>
          <button className="btn-primary flex-1 sm:flex-initial justify-center" onClick={() => setModal({ open: true, record: null })}>
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z"/></svg>
            Νέα Εγγραφή
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <div className="relative flex-1 min-w-[160px]">
          <input className="input pl-9" placeholder="Αναζήτηση…" value={filters.search}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value, page: 1 }))} />
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 absolute left-3 top-3 text-slate-400">
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd"/>
          </svg>
        </div>
        <MultiSelectDropdown
          label="Όλα τα Έτη"
          options={yearOptions}
          selected={selectedYears}
          onChange={v => { setSelectedYears(v); setFilters(f => ({ ...f, page: 1 })); }}
          getKey={o => o.value}
          getLabel={o => o.label}
        />
        <MultiSelectDropdown
          label="Όλοι οι μήνες"
          options={monthOptions}
          selected={selectedMonths}
          onChange={v => { setSelectedMonths(v); setFilters(f => ({ ...f, page: 1 })); }}
          getKey={o => o.value}
          getLabel={o => o.label}
        />
        <select className="input w-44" value={filters.category} onChange={e => setFilters(f => ({ ...f, category: e.target.value, page: 1 }))}>
          <option value="">Κατηγορία</option>
          {categories.map(c => <option key={c}>{c}</option>)}
        </select>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={hideNoAmount} onChange={e => setHideNoAmount(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-primary-600" />
          <span className="text-sm text-slate-600 whitespace-nowrap">Κρύψε χωρίς ποσό</span>
        </label>
        <div className="flex items-center gap-1 text-slate-400 text-xs">ή</div>
        <div className="flex items-center gap-1">
          <input type="date" className="input w-36 text-sm" value={dateFrom} onChange={e => setDateFrom(e.target.value)} placeholder="Από" />
          <span className="text-slate-400 text-xs">—</span>
          <input type="date" className="input w-36 text-sm" value={dateTo} onChange={e => setDateTo(e.target.value)} placeholder="Έως" />
          {(dateFrom || dateTo) && (
            <button className="btn-ghost btn-sm text-xs" onClick={() => { setDateFrom(''); setDateTo(''); }}>✕</button>
          )}
        </div>
        <button className="btn-ghost btn-sm" onClick={() => { setFilters({ category: '', search: '', page: 1 }); setSelectedYears([String(now.getFullYear())]); setSelectedMonths([String(now.getMonth()+1).padStart(2,'0')]); setHideNoAmount(false); setDateFrom(''); setDateTo(''); }}>
          ✕ Καθαρισμός
        </button>
      </div>

      <div className="card p-4 flex items-center gap-3 border-l-4 border-rose-400">
        <div>
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">Σύνολο Φίλτρων</div>
          <div className="text-xl font-black text-rose-600">{fmt(data.sum ?? 0)}</div>
        </div>
      </div>

      <CategorySummary byCategory={data.by_category} />

      <div className="card overflow-hidden">
        {/* Mobile card list */}
        <div className="md:hidden divide-y divide-slate-100">
          {data.data.map(r => (
            <div key={r.id} className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-700 truncate">{r.supplier || '—'}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{fmtDate(r.date)}</div>
                </div>
                <span className="font-bold text-rose-600 whitespace-nowrap shrink-0">{fmt(r.amount)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {r.category
                  ? <span className="badge-orange">{r.category}</span>
                  : <span className="text-slate-300 text-xs">—</span>}
                {r.related_service && <span className="text-xs text-slate-500">{r.related_service}</span>}
              </div>
              {r.description && <div className="text-xs text-slate-500">{r.description}</div>}
              <div className="flex items-center gap-2 pt-1">
                <button className="btn-secondary text-xs py-1 px-2" title="Αντιγραφή" onClick={() => handleDuplicate(r)}>📋</button>
                <button onClick={() => setModal({ open: true, record: r })} className="btn-ghost btn-sm p-2 rounded-lg" title="Επεξεργασία">
                  <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.633 1.73a.75.75 0 0 0 .963.963l1.73-.633a2.75 2.75 0 0 0 .892-.596l4.261-4.262a1.75 1.75 0 0 0 0-2.475ZM4.75 3.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h6.5c.69 0 1.25-.56 1.25-1.25V9A.75.75 0 0 1 14 9v2.25A2.75 2.75 0 0 1 11.25 14h-6.5A2.75 2.75 0 0 1 2 11.25v-6.5A2.75 2.75 0 0 1 4.75 2H7a.75.75 0 0 1 0 1.5H4.75Z"/></svg>
                </button>
                <button onClick={() => setDeleteId(r.id)} className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors">
                  <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.711Z" clipRule="evenodd"/></svg>
                </button>
              </div>
            </div>
          ))}
          {data.data.length === 0 && (
            <div className="text-center text-slate-400 py-12">
              <div className="text-3xl mb-2">🔍</div>
              Δεν βρέθηκαν εγγραφές
            </div>
          )}
        </div>
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <SortTh label="Ημερομηνία" field="date" sort={sort} onSort={handleSort} />
                <SortTh label="Κατηγορία" field="category" sort={sort} onSort={handleSort} />
                <SortTh label="Προμηθευτής" field="supplier" sort={sort} onSort={handleSort} />
                <th className="th">Υπηρεσία</th>
                <th className="th">Αιτιολογία</th>
                <SortTh label="Ποσό" field="amount" sort={sort} onSort={handleSort} className="text-right" />
                <th className="th w-16"></th>
              </tr>
            </thead>
            <tbody>
              {data.data.map(r => (
                <tr key={r.id} className="tr">
                  <td className="td whitespace-nowrap text-slate-500 text-xs">{fmtDate(r.date)}</td>
                  <td className="td">
                    {r.category
                      ? <span className="badge-orange">{r.category}</span>
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="td font-medium text-slate-700">{r.supplier || '—'}</td>
                  <td className="td text-xs text-slate-500">{r.related_service || '—'}</td>
                  <td className="td max-w-[200px]">
                    <div className="text-xs text-slate-500 truncate">{r.description || '—'}</div>
                  </td>
                  <td className="td text-right">
                    <span className="font-bold text-rose-600 whitespace-nowrap">{fmt(r.amount)}</span>
                  </td>
                  <td className="td">
                    <div className="flex gap-1">
                      <button
                        className="btn-secondary text-xs py-1 px-2"
                        title="Αντιγραφή"
                        onClick={() => handleDuplicate(r)}
                      >
                        📋
                      </button>
                      <button onClick={() => setModal({ open: true, record: r })} className="btn-ghost btn-sm p-2 rounded-lg" title="Επεξεργασία">
                        <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.633 1.73a.75.75 0 0 0 .963.963l1.73-.633a2.75 2.75 0 0 0 .892-.596l4.261-4.262a1.75 1.75 0 0 0 0-2.475ZM4.75 3.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h6.5c.69 0 1.25-.56 1.25-1.25V9A.75.75 0 0 1 14 9v2.25A2.75 2.75 0 0 1 11.25 14h-6.5A2.75 2.75 0 0 1 2 11.25v-6.5A2.75 2.75 0 0 1 4.75 2H7a.75.75 0 0 1 0 1.5H4.75Z"/></svg>
                      </button>
                      <button onClick={() => setDeleteId(r.id)} className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors">
                        <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.711Z" clipRule="evenodd"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {data.data.length === 0 && (
                <tr><td colSpan={7} className="td text-center text-slate-400 py-12">
                  <div className="text-3xl mb-2">🔍</div>
                  Δεν βρέθηκαν εγγραφές
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs text-slate-400">Σελίδα {filters.page} · {data.total.toLocaleString('el-GR')} σύνολο</span>
          <div className="flex gap-2">
            <button disabled={filters.page <= 1} onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}
              className="btn-secondary btn-sm disabled:opacity-40">← Προηγ.</button>
            <button disabled={filters.page * 200 >= data.total} onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}
              className="btn-secondary btn-sm disabled:opacity-40">Επόμ. →</button>
          </div>
        </div>
      </div>

      <Modal open={modal.open} onClose={() => setModal({ open: false, record: null, isDuplicate: false })}
        title={modal.isDuplicate ? 'Αντιγραφή Εξόδου' : modal.record ? 'Επεξεργασία Εξόδου' : 'Νέα Εγγραφή Εξόδου'} size="md">
        <ExpensesForm record={modal.isDuplicate ? { ...modal.record, id: undefined } : modal.record}
          onSave={() => { setModal({ open: false, record: null, isDuplicate: false }); load(); }}
          onCancel={() => setModal({ open: false, record: null, isDuplicate: false })} />
      </Modal>

      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Επιβεβαίωση Διαγραφής" size="sm">
        <p className="text-slate-600 mb-6">Σίγουρα να διαγραφεί η εγγραφή;</p>
        <div className="flex justify-end gap-3">
          <button className="btn-secondary" onClick={() => setDeleteId(null)}>Ακύρωση</button>
          <button className="btn-danger" onClick={() => handleDelete(deleteId)}>Διαγραφή</button>
        </div>
      </Modal>
    </div>
  );
}
