import { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import api from '../../api/client';
import Modal from '../../components/Modal';
import IncomeForm from './IncomeForm';
import toast from 'react-hot-toast';
import ElorusActionsButton from '../../components/ElorusActionsButton';

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
const fmtNum = n => n != null && n !== '' ? Number(n).toLocaleString('el-GR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '—';
const fmt = n => n != null && n !== '' ? Number(n).toLocaleString('el-GR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €' : '—';
const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

const STATUS_STYLE = {
  'ΟΛΟΚΛΗΡΩΜΕΝΗ - ΕΠΙΤΥΧΩΣ':  'badge-green',
  'ΟΛΟΚΛΗΡΩΜΕΝΗ - ΑΠΟΡΡΙΨΗ':   'badge-red',
  'ΟΛΟΚΛΗΡΩΜΕΝΗ - ΠΑΡΑΙΤΗΣΗ':  'badge-yellow',
  'ΥΠΟΒΟΛΗ ΑΙΤΗΣΗΣ':           'badge-blue',
  'ΔΕΝ ΠΡΟΧΩΡΗΣΕ':             'badge-gray',
};
const statusBadge = s => {
  const cls = STATUS_STYLE[s] || 'badge-gray';
  const short = s?.length > 20 ? s.slice(0, 18) + '…' : (s || '—');
  return <span className={cls}>{short}</span>;
};

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

// Max 3 years of history
const yearOptions = Array.from({ length: 3 }, (_, i) => ({ value: String(now.getFullYear() - i), label: String(now.getFullYear() - i) }));
const monthOptions = [
  { value: '01', label: 'Ιαν' }, { value: '02', label: 'Φεβ' }, { value: '03', label: 'Μαρ' },
  { value: '04', label: 'Απρ' }, { value: '05', label: 'Μαι' }, { value: '06', label: 'Ιουν' },
  { value: '07', label: 'Ιουλ' }, { value: '08', label: 'Αυγ' }, { value: '09', label: 'Σεπ' },
  { value: '10', label: 'Οκτ' }, { value: '11', label: 'Νοε' }, { value: '12', label: 'Δεκ' },
];

export default function IncomeList() {
  const [data, setData] = useState({ total: 0, data: [] });
  const [filters, setFilters] = useState({ service_type: '', search: '', page: 1 });
  // Default: current year only, no month filter
  const [selectedYears, setSelectedYears] = useState([String(now.getFullYear())]);
  const [selectedMonths, setSelectedMonths] = useState([]);
  const [selectedAgents, setSelectedAgents] = useState([]);
  const [selectedStatuses, setSelectedStatuses] = useState([]);
  const [sort, setSort] = useState({ field: 'createdAt', dir: 'DESC' });
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [modal, setModal] = useState({ open: false, record: null });
  const [deleteId, setDeleteId] = useState(null);
  const [services, setServices] = useState([]); // full objects: { id, value, category, ... }
  const [agents, setAgents] = useState([]);
  const [workStatusOptions, setWorkStatusOptions] = useState([]);

  const load = useCallback(() => {
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''));
    params.sort_field = sort.field;
    params.sort_dir = sort.dir;
    params.limit = 50;

    if (selectedYears.length === 1) params.year = selectedYears[0];
    else if (selectedYears.length > 1) params.years = selectedYears.join(',');

    if (selectedMonths.length === 1) params.month = selectedMonths[0];
    else if (selectedMonths.length > 1) params.months = selectedMonths.join(',');

    if (selectedAgents.length === 1) params.sales_agent = selectedAgents[0];
    else if (selectedAgents.length > 1) params.sales_agents = selectedAgents.join(',');

    if (selectedStatuses.length === 1) params.work_status = selectedStatuses[0];
    else if (selectedStatuses.length > 1) params.work_statuses = selectedStatuses.join(',');

    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;

    api.get('/income', { params }).then(r => setData(r.data));
  }, [filters, selectedYears, selectedMonths, selectedAgents, selectedStatuses, sort, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get('/lists?list_type=ΕΙΔΟΣ_ΥΠΗΡΕΣΙΑΣ&active_only=true').then(r => setServices(r.data));
    api.get('/lists?list_type=ΠΡΑΚΤΟΡΕΣ&active_only=true').then(r => setAgents(r.data.map(x => x.value)));
    api.get('/lists?list_type=ΚΑΤΑΣΤΑΣΗ_ΕΡΓΑΣΙΑΣ&active_only=true').then(r => setWorkStatusOptions(r.data.map(x => x.value))).catch(() => {});
  }, []);

  const handleSort = field => {
    setSort(s => s.field === field ? { field, dir: s.dir === 'DESC' ? 'ASC' : 'DESC' } : { field, dir: 'DESC' });
    setFilters(f => ({ ...f, page: 1 }));
  };

  const handleDelete = async id => {
    try { await api.delete(`/income/${id}`); toast.success('Διαγράφηκε'); setDeleteId(null); load(); }
    catch { toast.error('Σφάλμα διαγραφής'); }
  };

  const handleDuplicate = (row) => {
    const copy = { ...row };
    delete copy.id;
    copy.sale_date = new Date().toISOString().slice(0, 10);
    copy.invoice_number = '';
    copy.accountant_notified = false;
    copy.accountant_notified_at = null;
    copy.elorus_invoice_id = null;
    setModal({ open: true, record: copy, isDuplicate: true });
  };

  const clearFilters = () => {
    setFilters({ service_type: '', search: '', page: 1 });
    setSelectedYears([String(now.getFullYear())]);
    setSelectedMonths([]);
    setSelectedAgents([]);
    setSelectedStatuses([]);
    setDateFrom('');
    setDateTo('');
  };

  const handleExport = async () => {
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''));
      if (selectedYears.length === 1) params.year = selectedYears[0];
      else if (selectedYears.length > 1) params.years = selectedYears.join(',');
      if (selectedMonths.length === 1) params.month = selectedMonths[0];
      else if (selectedMonths.length > 1) params.months = selectedMonths.join(',');
      if (selectedAgents.length === 1) params.sales_agent = selectedAgents[0];
      else if (selectedAgents.length > 1) params.sales_agents = selectedAgents.join(',');
      if (selectedStatuses.length === 1) params.work_status = selectedStatuses[0];
      else if (selectedStatuses.length > 1) params.work_statuses = selectedStatuses.join(',');
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      params.limit = 5000;
      params.page = 1;
      const r = await api.get('/income', { params });
      const rows = r.data.data.map(row => ({
        'Ημερομηνία': row.sale_date || '',
        'Επωνυμία': row.customer_name || '',
        'ΑΦΜ': row.vat_number || '',
        'Υπηρεσία': row.service_type || '',
        'Κατάσταση': row.work_status || '',
        'Σύμβουλος': row.sales_agent || '',
        'Τηλ': row.phone || '',
        'Email': row.email || '',
        'Ποσό Αίτησης': row.amount_application != null ? Number(row.amount_application) : '',
        'Ποσό Υλοποίησης': row.amount_implementation != null ? Number(row.amount_implementation) : '',
        'Ποσό Είσπραξης': row.amount_collected != null ? Number(row.amount_collected) : '',
        'ΦΠΑ': row.vat_amount != null ? Number(row.vat_amount) : '',
        'Bonus': row.bonus != null ? Number(row.bonus) : '',
        'Αρ. Τιμολογίου': row.invoice_number || '',
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Έσοδα');
      XLSX.writeFile(wb, `esoda_${new Date().toISOString().slice(0,10)}.xlsx`);
    } catch {
      toast.error('Σφάλμα εξαγωγής');
    }
  };

  const agentOptions = agents.map(a => ({ value: a }));
  const statusOpts = workStatusOptions.length > 0
    ? workStatusOptions.map(s => ({ value: s }))
    : Object.keys(STATUS_STYLE).map(s => ({ value: s }));

  // Build category → services grouping for the summary bar
  const hasCategories = services.some(s => s.category);
  const summaryCategoryGroups = (() => {
    if (!hasCategories || !data.by_service?.length) return null;
    const catMap = {};
    services.forEach(s => { catMap[s.value] = s.category || 'Άλλα'; });
    const groups = {};
    (data.by_service || []).forEach(s => {
      const cat = catMap[s.service_type] || 'Άλλα';
      if (!groups[cat]) groups[cat] = { sum: 0, services: [] };
      groups[cat].sum += parseFloat(s.sum) || 0;
      groups[cat].services.push({ type: s.service_type, sum: parseFloat(s.sum) || 0 });
    });
    return Object.entries(groups).sort((a, b) => b[1].sum - a[1].sum);
  })();

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Έσοδα</h1>
          <p className="page-sub">{data.total.toLocaleString('el-GR')} εγγραφές σύνολο</p>
        </div>
        <div className="flex items-center gap-2">
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

      <div className="filter-bar flex-wrap gap-2">
        <div className="relative flex-1 min-w-[160px]">
          <input className="input pl-9" placeholder="Αναζήτηση επωνυμίας…" value={filters.search}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value, page: 1 }))} />
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 absolute left-3 top-3 text-slate-400">
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd"/>
          </svg>
        </div>
        <MultiSelectDropdown
          label="Έτος"
          options={yearOptions}
          selected={selectedYears}
          onChange={v => { setSelectedYears(v); setFilters(f => ({ ...f, page: 1 })); }}
          getKey={o => o.value}
          getLabel={o => o.label}
        />
        <MultiSelectDropdown
          label="Μήνας"
          options={monthOptions}
          selected={selectedMonths}
          onChange={v => { setSelectedMonths(v); setFilters(f => ({ ...f, page: 1 })); }}
          getKey={o => o.value}
          getLabel={o => o.label}
        />
        <select className="input w-44" value={filters.service_type} onChange={e => setFilters(f => ({ ...f, service_type: e.target.value, page: 1 }))}>
          <option value="">Υπηρεσία</option>
          {services.map(s => <option key={s.id} value={s.value}>{s.value}</option>)}
        </select>
        <MultiSelectDropdown
          label="Σύμβουλος"
          options={agentOptions}
          selected={selectedAgents}
          onChange={v => { setSelectedAgents(v); setFilters(f => ({ ...f, page: 1 })); }}
          getKey={o => o.value}
          getLabel={o => o.value}
        />
        <MultiSelectDropdown
          label="Κατάσταση"
          options={statusOpts}
          selected={selectedStatuses}
          onChange={v => { setSelectedStatuses(v); setFilters(f => ({ ...f, page: 1 })); }}
          getKey={o => o.value}
          getLabel={o => o.value}
        />
        <div className="flex items-center gap-1">
          <input type="date" className="input w-34 text-sm" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <span className="text-slate-400 text-xs">—</span>
          <input type="date" className="input w-34 text-sm" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          {(dateFrom || dateTo) && (
            <button className="btn-ghost btn-sm text-xs" onClick={() => { setDateFrom(''); setDateTo(''); }}>✕</button>
          )}
        </div>
        <button className="btn-ghost btn-sm" onClick={clearFilters}>✕ Καθαρισμός</button>
      </div>

      <div className="card p-4 flex flex-wrap items-center gap-4 border-l-4 border-emerald-400">
        <div className="shrink-0">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">Σύνολο Φίλτρων</div>
          <div className="text-xl font-black text-emerald-600">{Math.round(data.sum ?? 0).toLocaleString('el-GR')} €</div>
        </div>
        {summaryCategoryGroups
          ? summaryCategoryGroups.map(([cat, info]) => {
              const pct = data.sum > 0 ? Math.round(info.sum / data.sum * 100) : 0;
              const kLabel = info.sum >= 1000 ? (info.sum / 1000).toFixed(1).replace('.', ',') + 'k' : Math.round(info.sum) + '€';
              return (
                <div key={cat} className="group relative px-3 py-1.5 bg-indigo-50 rounded-lg border border-indigo-100 shrink-0 cursor-default">
                  <div className="text-[10px] font-bold text-indigo-400 uppercase truncate max-w-[140px]">{cat}</div>
                  <div className="text-sm font-black text-indigo-700">{kLabel} <span className="text-xs font-semibold text-indigo-300">{pct}%</span></div>
                  {/* Hover breakdown tooltip */}
                  <div className="absolute z-20 bottom-full left-0 mb-1 hidden group-hover:block bg-white border border-slate-200 rounded-xl shadow-xl p-3 min-w-[180px]">
                    <div className="text-[10px] font-bold text-slate-400 uppercase mb-2">{cat} – Ανάλυση</div>
                    {info.services.sort((a, b) => b.sum - a.sum).map(sv => {
                      const svPct = info.sum > 0 ? Math.round(sv.sum / info.sum * 100) : 0;
                      const svK = sv.sum >= 1000 ? (sv.sum / 1000).toFixed(1).replace('.', ',') + 'k' : Math.round(sv.sum) + '€';
                      return (
                        <div key={sv.type} className="flex items-center justify-between gap-3 py-0.5">
                          <span className="text-xs text-slate-600 truncate max-w-[120px]">{sv.type || '—'}</span>
                          <span className="text-xs font-bold text-slate-700 shrink-0">{svK} <span className="text-slate-400 font-normal">{svPct}%</span></span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          : (data.by_service || []).map((s, i) => {
              const sSum = parseFloat(s.sum) || 0;
              const kLabel = sSum >= 1000 ? (sSum / 1000).toFixed(1).replace('.', ',') + 'k' : Math.round(sSum) + '€';
              const pct = data.sum > 0 ? Math.round(sSum / data.sum * 100) : 0;
              return (
                <div key={i} className="px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-100 shrink-0">
                  <div className="text-[10px] font-bold text-slate-400 uppercase truncate max-w-[120px]">{s.service_type || '—'}</div>
                  <div className="text-sm font-black text-slate-700">{kLabel} <span className="text-xs font-semibold text-slate-400">{pct}%</span></div>
                </div>
              );
            })
        }
      </div>

      <div className="card overflow-hidden">
        {/* Mobile card list */}
        <div className="md:hidden divide-y divide-slate-100">
          {data.data.map(r => (
            <div key={r.id} className="p-4 space-y-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-800 truncate">{r.customer_name}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{fmtDate(r.sale_date)}{r.vat_number ? ` · ΑΦΜ ${r.vat_number}` : ''}</div>
                  {r.accountant && <div className="text-xs text-slate-400 truncate">{r.accountant}</div>}
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold text-emerald-600 whitespace-nowrap">{fmt(r.amount_collected)}</div>
                  {r.bonus > 0 && <div className="text-xs text-amber-500 whitespace-nowrap">+{fmtNum(r.bonus)} bonus</div>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {statusBadge(r.work_status)}
                {r.sales_agent && <span className="badge-purple">{r.sales_agent}</span>}
                {r.service_type && <span className="text-xs text-slate-500">{r.service_type}</span>}
              </div>
              {(r.amount_application || r.amount_implementation) && (
                <div className="text-xs text-slate-500 flex flex-wrap gap-3">
                  {r.amount_application ? <span>Αίτ.: {fmtNum(r.amount_application)}</span> : null}
                  {r.amount_implementation ? <span>Υλ.: {fmtNum(r.amount_implementation)}</span> : null}
                </div>
              )}
              {(r.phone || r.email) && (
                <div className="text-xs text-slate-500 flex flex-wrap gap-3">
                  {r.phone && <span>📞 {r.phone}</span>}
                  {r.email && <a href={`mailto:${r.email}`} className="text-indigo-500 hover:underline">{r.email}</a>}
                </div>
              )}
              <div className="flex items-center gap-2 pt-1">
                <ElorusActionsButton record={r} onRefresh={load} />
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
                <SortTh label="Ημερομηνία" field="sale_date" sort={sort} onSort={handleSort} />
                <SortTh label="Επωνυμία" field="customer_name" sort={sort} onSort={handleSort} />
                <th className="th text-xs">ΑΦΜ</th>
                <SortTh label="Υπηρεσία" field="service_type" sort={sort} onSort={handleSort} />
                <SortTh label="Κατάσταση" field="work_status" sort={sort} onSort={handleSort} />
                <SortTh label="Σύμβουλος" field="sales_agent" sort={sort} onSort={handleSort} />
                <th className="th text-xs w-20">Τηλ</th>
                <th className="th text-xs w-24">Email</th>
                <SortTh label="Αίτ." field="amount_application" sort={sort} onSort={handleSort} className="text-right" />
                <SortTh label="Υλ." field="amount_implementation" sort={sort} onSort={handleSort} className="text-right" />
                <SortTh label="Ποσό" field="amount_collected" sort={sort} onSort={handleSort} className="text-right" />
                <th className="th w-24"></th>
              </tr>
            </thead>
            <tbody>
              {data.data.map(r => (
                <tr key={r.id} className="tr">
                  <td className="td whitespace-nowrap text-slate-500 text-xs">{fmtDate(r.sale_date)}</td>
                  <td className="td text-left">
                    <div className="font-semibold text-slate-800 max-w-[180px] truncate">{r.customer_name}</div>
                    {r.accountant && <div className="text-xs text-slate-400 mt-0.5 truncate max-w-[180px]">{r.accountant}</div>}
                  </td>
                  <td className="td text-xs text-slate-500 whitespace-nowrap">{r.vat_number || '—'}</td>
                  <td className="td max-w-[140px]">
                    <div className="text-xs text-slate-600 truncate">{r.service_type || '—'}</div>
                  </td>
                  <td className="td">{statusBadge(r.work_status)}</td>
                  <td className="td">
                    {r.sales_agent
                      ? <span className="badge-purple">{r.sales_agent}</span>
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="td w-20 max-w-[80px]">
                    <div className="text-xs text-slate-500 truncate">{r.phone || '—'}</div>
                  </td>
                  <td className="td w-24 max-w-[96px]">
                    {r.email
                      ? <a href={`mailto:${r.email}`} className="text-xs text-indigo-500 hover:underline truncate block max-w-[96px]">{r.email}</a>
                      : <span className="text-xs text-slate-300">—</span>}
                  </td>
                  <td className="td text-right text-xs font-medium text-slate-600 whitespace-nowrap">
                    {r.amount_application ? fmtNum(r.amount_application) : <span className="text-slate-200">—</span>}
                  </td>
                  <td className="td text-right text-xs font-medium text-slate-600 whitespace-nowrap">
                    {r.amount_implementation ? fmtNum(r.amount_implementation) : <span className="text-slate-200">—</span>}
                  </td>
                  <td className="td text-right">
                    <span className="font-bold text-emerald-600 whitespace-nowrap">{fmt(r.amount_collected)}</span>
                    {r.bonus > 0 && <div className="text-xs text-amber-500 whitespace-nowrap">+{fmtNum(r.bonus)} bonus</div>}
                  </td>
                  <td className="td">
                    <div className="flex items-center gap-1">
                      <ElorusActionsButton record={r} onRefresh={load} />
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
                <tr><td colSpan={12} className="td text-center text-slate-400 py-12">
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
            <button disabled={filters.page * 50 >= data.total} onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}
              className="btn-secondary btn-sm disabled:opacity-40">Επόμ. →</button>
          </div>
        </div>
      </div>

      <Modal open={modal.open} onClose={() => setModal({ open: false, record: null, isDuplicate: false })}
        title={modal.isDuplicate ? 'Αντιγραφή Εσόδου' : modal.record ? 'Επεξεργασία Εγγραφής' : 'Νέα Εγγραφή Εσόδου'} size="lg">
        <IncomeForm record={modal.isDuplicate ? { ...modal.record, id: undefined } : modal.record}
          onSave={() => { setModal({ open: false, record: null, isDuplicate: false }); load(); }}
          onCancel={() => setModal({ open: false, record: null, isDuplicate: false })} />
      </Modal>

      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Επιβεβαίωση Διαγραφής" size="sm">
        <p className="text-slate-600 mb-6">Σίγουρα να διαγραφεί η εγγραφή; Η ενέργεια δεν αναιρείται.</p>
        <div className="flex justify-end gap-3">
          <button className="btn-secondary" onClick={() => setDeleteId(null)}>Ακύρωση</button>
          <button className="btn-danger" onClick={() => handleDelete(deleteId)}>Διαγραφή</button>
        </div>
      </Modal>
    </div>
  );
}
