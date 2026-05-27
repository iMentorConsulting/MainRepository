import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../api/client';
import Modal from '../../components/Modal';
import CustomerSearch from '../../components/CustomerSearch';
import toast from 'react-hot-toast';

const now = new Date();

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
    : selected.length === 1 ? getLabel(options.find(o => getKey(o) === selected[0]) || {})
    : `${selected.length} επιλεγμένα`;
  const toggle = key => onChange(selected.includes(key) ? selected.filter(k => k !== key) : [...selected, key]);
  return (
    <div className="relative" ref={ref}>
      <button type="button" className="input flex items-center justify-between gap-2 min-w-[110px] text-left" onClick={() => setOpen(v => !v)}>
        <span className={`truncate text-sm ${allSelected ? 'text-slate-400' : 'text-slate-700'}`}>{displayLabel}</span>
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-slate-400 shrink-0">
          <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd"/>
        </svg>
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 min-w-[140px] bg-white border border-slate-200 rounded-xl shadow-lg py-1 max-h-64 overflow-y-auto">
          <label className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer border-b border-slate-100">
            <input type="checkbox" checked={allSelected} onChange={() => onChange([])} className="w-4 h-4 rounded border-slate-300 text-primary-600" />
            <span className="text-sm text-slate-600 font-medium">{label}</span>
          </label>
          {options.map(opt => {
            const key = getKey(opt);
            return (
              <label key={key} className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                <input type="checkbox" checked={selected.includes(key)} onChange={() => toggle(key)} className="w-4 h-4 rounded border-slate-300 text-primary-600" />
                <span className="text-sm text-slate-700">{getLabel(opt)}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

const fmt = n => n != null && n !== '' ? Number(n).toLocaleString('el-GR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €' : '—';
const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

const STATUS_BADGE = {
  'ΕΝ ΕΞΕΛΙΞΕΙ': 'badge-green',
  'ΠΑΓΩΜΕΝΕΣ': 'badge-yellow',
  'ΟΛΟΚΛΗΡΩΜΕΝΕΣ ΕΠΙΤΥΧΩΣ': 'badge-blue',
  'ΟΛΟΚΛΗΡΩΜΕΝΕΣ FAIL': 'badge-red',
  'ΑΠΟΠΛΗΡΩΜΕΝΕΣ': 'badge-purple',
  'ΑΠΟΠΛΗΡΩΜΗ ΑΙΤΗΣΗΣ': 'badge-orange',
};

const STATUS_OPTS = ['ΕΝ ΕΞΕΛΙΞΕΙ', 'ΠΑΓΩΜΕΝΕΣ', 'ΑΠΟΠΛΗΡΩΜΗ ΑΙΤΗΣΗΣ', 'ΟΛΟΚΛΗΡΩΜΕΝΕΣ ΕΠΙΤΥΧΩΣ', 'ΟΛΟΚΛΗΡΩΜΕΝΕΣ FAIL', 'ΑΠΟΠΛΗΡΩΜΕΝΕΣ'];

const EMPTY_FORM = {
  customer_id: '',
  customer_name: '',
  vat_number: '',
  service_type: '',
  status: 'ΕΝ ΕΞΕΛΙΞΕΙ',
  amount_application: '',
  amount_implementation: '',
  approval_date: '',
  completion_deadline: '',
  investment_height: '',
  total_debts: '',
  sales_agent: '',
  folder_agent: '',
  source_referral: '',
  targeting_category: '',
  description: '',
};

function SAForm({ record, onSave, onCancel }) {
  const [form, setForm] = useState(record ? { ...record } : { ...EMPTY_FORM });
  const [lists, setLists] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const types = ['ΕΙΔΟΣ_ΥΠΗΡΕΣΙΑΣ', 'ΠΡΑΚΤΟΡΕΣ', 'ΠΗΓΗ_ΣΥΣΤΑΣΗ'];
    Promise.all(types.map(t => api.get(`/lists?list_type=${t}&active_only=true`)))
      .then(results => {
        const l = {};
        types.forEach((t, i) => { l[t] = results[i].data.map(x => x.value); });
        setLists(l);
      });
  }, []);

  const handleCustomerSelect = c => {
    if (!c) { setForm(f => ({ ...f, customer_id: '', customer_name: '' })); return; }
    if (c._new) { setForm(f => ({ ...f, customer_name: c.name, customer_id: '' })); return; }
    setForm(f => ({
      ...f,
      customer_name: c.name,
      vat_number: c.vat_number || f.vat_number,
      customer_id: c.id || '',
    }));
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async e => {
    e.preventDefault();
    if (!form.customer_name) { toast.error('Συμπληρώστε την επωνυμία'); return; }
    setSaving(true);
    try {
      if (record?.id) await api.put(`/service-agreements/${record.id}`, form);
      else await api.post('/service-agreements', form);
      toast.success(record?.id ? 'Ενημερώθηκε!' : 'Καταχωρήθηκε!');
      onSave();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Σφάλμα');
    } finally {
      setSaving(false);
    }
  };

  const F = ({ label, name, type = 'text', required = false }) => (
    <div>
      <label className="label">{label}{required && <span className="text-rose-500 ml-1">*</span>}</label>
      <input type={type} className="input" value={form[name] || ''} onChange={e => set(name, e.target.value)} />
    </div>
  );

  const Sel = ({ label, name, opts, required = false }) => (
    <div>
      <label className="label">{label}{required && <span className="text-rose-500 ml-1">*</span>}</label>
      <select className="input" value={form[name] || ''} onChange={e => set(name, e.target.value)}>
        <option value="">— Επιλογή —</option>
        {opts?.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-4">
          <span className="text-xs font-bold uppercase tracking-widest text-indigo-500">Στοιχεία Πελάτη</span>
          <div className="flex-1 h-px bg-slate-100" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">Αναζήτηση Πελάτη</label>
            <CustomerSearch value={record?.customer_name || ''} onSelect={handleCustomerSelect} />
          </div>
          <div className="col-span-2 grid grid-cols-2 gap-4">
            <div>
              <label className="label">Επωνυμία <span className="text-rose-500 ml-1">*</span></label>
              <input type="text" className="input" value={form.customer_name || ''} onChange={e => set('customer_name', e.target.value)} />
            </div>
            <F label="ΑΦΜ" name="vat_number" />
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-3 mb-4">
          <span className="text-xs font-bold uppercase tracking-widest text-indigo-500">Στοιχεία Συμφωνίας</span>
          <div className="flex-1 h-px bg-slate-100" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Sel label="Είδος Υπηρεσίας" name="service_type" opts={lists['ΕΙΔΟΣ_ΥΠΗΡΕΣΙΑΣ']} />
          <Sel label="Κατάσταση" name="status" opts={STATUS_OPTS} />
          <F label="Ποσό Αίτησης (€)" name="amount_application" type="number" />
          <F label="Ποσό Υλοποίησης (€)" name="amount_implementation" type="number" />
          <F label="Ημ. Έγκρισης" name="approval_date" type="date" />
          <F label="Προθεσμία Ολοκλήρωσης" name="completion_deadline" type="date" />
          <F label="Ύψος Επένδυσης (€)" name="investment_height" type="number" />
          <F label="Σύνολο Οφειλών (€)" name="total_debts" type="number" />
        </div>
      </div>

      <div>
        <div className="flex items-center gap-3 mb-4">
          <span className="text-xs font-bold uppercase tracking-widest text-indigo-500">Στοιχεία Πώλησης</span>
          <div className="flex-1 h-px bg-slate-100" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Sel label="Υπεύθυνος Πώλησης" name="sales_agent" opts={lists['ΠΡΑΚΤΟΡΕΣ']} />
          <Sel label="Υπεύθυνος Φακέλου" name="folder_agent" opts={lists['ΠΡΑΚΤΟΡΕΣ']} />
          <Sel label="Πηγή / Σύσταση" name="source_referral" opts={lists['ΠΗΓΗ_ΣΥΣΤΑΣΗ']} />
          <div>
            <label className="label">Κατηγορία Στοχοθεσίας</label>
            <input type="text" className="input" value={form.targeting_category || ''} onChange={e => set('targeting_category', e.target.value)} />
          </div>
        </div>
        <div className="mt-4">
          <label className="label">Περιγραφή</label>
          <textarea className="input h-20 resize-none" value={form.description || ''} onChange={e => set('description', e.target.value)} />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
        <button type="button" className="btn-secondary" onClick={onCancel}>Ακύρωση</button>
        <button type="submit" className="btn-primary" disabled={saving}>{record?.id ? 'Αποθήκευση' : 'Καταχώρηση'}</button>
      </div>
    </form>
  );
}

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

const YEAR_OPTS = Array.from({ length: 8 }, (_, i) => ({ value: String(now.getFullYear() - i) }));
const MONTH_OPTS = [
  { value: '1', label: 'Ιαν' }, { value: '2', label: 'Φεβ' }, { value: '3', label: 'Μαρ' },
  { value: '4', label: 'Απρ' }, { value: '5', label: 'Μαι' }, { value: '6', label: 'Ιουν' },
  { value: '7', label: 'Ιουλ' }, { value: '8', label: 'Αυγ' }, { value: '9', label: 'Σεπ' },
  { value: '10', label: 'Οκτ' }, { value: '11', label: 'Νοε' }, { value: '12', label: 'Δεκ' },
];

export default function ServiceAgreementsPage() {
  const [data, setData] = useState({ data: [], total: 0 });
  const [filters, setFilters] = useState({ search: '', status: '', sales_agent: '', service_type: '' });
  const [sort, setSort] = useState({ field: 'createdAt', dir: 'DESC' });
  const [selectedSaleYears, setSelectedSaleYears] = useState([]);
  const [selectedSaleMonths, setSelectedSaleMonths] = useState([]);
  const [modal, setModal] = useState({ open: false, record: null });
  const [deleteId, setDeleteId] = useState(null);
  const [stats, setStats] = useState({ total: 0, byStatus: {} });
  const [agents, setAgents] = useState([]);
  const [services, setServices] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);

  const handleSort = field => {
    setSort(s => s.field === field ? { field, dir: s.dir === 'DESC' ? 'ASC' : 'DESC' } : { field, dir: 'DESC' });
  };

  const load = useCallback(() => {
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''));
    params.limit = 50;
    params.sort_field = sort.field;
    params.sort_dir = sort.dir;
    if (selectedSaleYears.length === 1) params.sale_year = selectedSaleYears[0];
    else if (selectedSaleYears.length > 1) params.sale_years = selectedSaleYears.join(',');
    if (selectedSaleMonths.length === 1) params.sale_month = selectedSaleMonths[0];
    else if (selectedSaleMonths.length > 1) params.sale_months = selectedSaleMonths.join(',');
    api.get('/service-agreements', { params })
      .then(r => setData(r.data))
      .catch(err => toast.error('Σφάλμα φόρτωσης συμφωνιών: ' + (err.response?.data?.error || err.message)));
  }, [filters, sort, selectedSaleYears, selectedSaleMonths]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.get('/service-agreements/stats').then(r => setStats(r.data)).catch(() => {});
    api.get('/lists?list_type=ΠΡΑΚΤΟΡΕΣ&active_only=true').then(r => setAgents(r.data.map(x => x.value))).catch(() => {});
    api.get('/lists?list_type=ΕΙΔΟΣ_ΥΠΗΡΕΣΙΑΣ&active_only=true').then(r => setServices(r.data.map(x => x.value))).catch(() => {});
  }, []);

  const allVisibleIds = (data.data || []).map(r => r.id);
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every(id => selectedIds.has(id));
  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(allVisibleIds));
  };
  const toggleOne = id => setSelectedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const handleBulkStatus = async () => {
    if (!bulkStatus || selectedIds.size === 0) return;
    setBulkSaving(true);
    try {
      await Promise.all([...selectedIds].map(id => api.put(`/service-agreements/${id}`, { status: bulkStatus })));
      toast.success(`Ενημερώθηκαν ${selectedIds.size} συμφωνίες → ${bulkStatus}`);
      setSelectedIds(new Set());
      setBulkStatus('');
      load();
    } catch {
      toast.error('Σφάλμα μαζικής ενημέρωσης');
    } finally {
      setBulkSaving(false);
    }
  };

  const handleDelete = async id => {
    try {
      await api.delete(`/service-agreements/${id}`);
      toast.success('Διαγράφηκε');
      setDeleteId(null);
      load();
    } catch {
      toast.error('Σφάλμα διαγραφής');
    }
  };

  const rows = data.data || [];
  const sumApplication = rows.reduce((a, r) => a + parseFloat(r.amount_application || 0), 0);
  const sumImplementation = rows.reduce((a, r) => a + parseFloat(r.amount_implementation || 0), 0);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Συμφωνίες Υπηρεσιών</h1>
          <p className="page-sub">{data.total} εγγραφές (φίλτρο) · {stats.total} σύνολο</p>
        </div>
        <button className="btn-primary" onClick={() => setModal({ open: true, record: null })}>
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z"/>
          </svg>
          Νέα Συμφωνία
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="card p-4 border-l-4 border-slate-400">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">Σύνολο</div>
          <div className="text-2xl font-black text-slate-600">{stats.total}</div>
        </div>
        <div className="card p-4 border-l-4 border-emerald-400">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">Ενεργές</div>
          <div className="text-2xl font-black text-emerald-600">{stats.byStatus['ΕΝ ΕΞΕΛΙΞΕΙ'] || 0}</div>
        </div>
        <div className="card p-4 border-l-4 border-blue-400">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">Ολοκληρωμένες</div>
          <div className="text-2xl font-black text-blue-600">{(stats.byStatus['ΟΛΟΚΛΗΡΩΜΕΝΕΣ ΕΠΙΤΥΧΩΣ'] || 0) + (stats.byStatus['ΑΠΟΠΛΗΡΩΜΕΝΕΣ'] || 0)}</div>
        </div>
        <div className="card p-4 border-l-4 border-indigo-400">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">Σύνολο Αιτήσεων</div>
          <div className="text-2xl font-black text-indigo-600">{fmt(sumApplication)}</div>
        </div>
      </div>

      <div className="filter-bar">
        <div className="relative flex-1 min-w-[160px]">
          <input className="input pl-9" placeholder="Αναζήτηση πελάτη / υπηρεσίας…" value={filters.search}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} />
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 absolute left-3 top-3 text-slate-400">
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd"/>
          </svg>
        </div>
        <select className="input w-44" value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
          <option value="">Όλες οι καταστάσεις</option>
          {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="input w-36" value={filters.sales_agent} onChange={e => setFilters(f => ({ ...f, sales_agent: e.target.value }))}>
          <option value="">Σύμβουλος</option>
          {agents.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select className="input w-44" value={filters.service_type} onChange={e => setFilters(f => ({ ...f, service_type: e.target.value }))}>
          <option value="">Υπηρεσία</option>
          {services.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="flex items-center gap-1 border-l border-slate-200 pl-2 ml-1">
          <span className="text-xs text-slate-400 whitespace-nowrap">Ημ. Συμφωνίας:</span>
          <MultiSelectDropdown
            label="Έτος"
            options={YEAR_OPTS}
            selected={selectedSaleYears}
            onChange={setSelectedSaleYears}
            getKey={o => o.value}
            getLabel={o => o.value}
          />
          <MultiSelectDropdown
            label="Μήνας"
            options={MONTH_OPTS}
            selected={selectedSaleMonths}
            onChange={setSelectedSaleMonths}
            getKey={o => o.value}
            getLabel={o => o.label}
          />
        </div>
        <button className="btn-ghost btn-sm" onClick={() => { setFilters({ search: '', status: '', sales_agent: '', service_type: '' }); setSelectedSaleYears([]); setSelectedSaleMonths([]); }}>
          ✕ Καθαρισμός
        </button>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-indigo-50 border border-indigo-200 animate-slide-up">
          <span className="text-sm font-bold text-indigo-700 shrink-0">{selectedIds.size} επιλεγμένες</span>
          <div className="flex-1" />
          <select
            className="input w-56 text-sm"
            value={bulkStatus}
            onChange={e => setBulkStatus(e.target.value)}
          >
            <option value="">— Νέα Κατάσταση —</option>
            {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button
            className="btn-primary text-sm px-4 py-2 disabled:opacity-50"
            disabled={!bulkStatus || bulkSaving}
            onClick={handleBulkStatus}
          >
            {bulkSaving ? 'Εφαρμογή…' : 'Εφαρμογή'}
          </button>
          <button className="btn-ghost btn-sm text-slate-500" onClick={() => setSelectedIds(new Set())}>
            ✕ Αποεπιλογή
          </button>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th w-10 pr-0">
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-slate-300 text-primary-600 cursor-pointer" />
                </th>
                <SortTh label="Πελάτης" field="customer_name" sort={sort} onSort={handleSort} />
                <th className="th">ΑΦΜ</th>
                <SortTh label="Υπηρεσία" field="service_type" sort={sort} onSort={handleSort} />
                <SortTh label="Κατάσταση" field="status" sort={sort} onSort={handleSort} />
                <SortTh label="Ποσό Αίτησης" field="amount_application" sort={sort} onSort={handleSort} className="text-right" />
                <SortTh label="Ποσό Υλοποίησης" field="amount_implementation" sort={sort} onSort={handleSort} className="text-right" />
                <th className="th">Είσπραξη</th>
                <th className="th text-right">Υπόλοιπο</th>
                <SortTh label="Σύμβουλος" field="sales_agent" sort={sort} onSort={handleSort} />
                <th className="th">Ημ. Συμφωνίας</th>
                <SortTh label="Ημ. Έγκρισης" field="approval_date" sort={sort} onSort={handleSort} />
                <th className="th w-20"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className={`tr ${selectedIds.has(r.id) ? 'bg-indigo-50/60' : ''}`}>
                  <td className="td pr-0">
                    <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleOne(r.id)}
                      className="w-4 h-4 rounded border-slate-300 text-primary-600 cursor-pointer" />
                  </td>
                  <td className="td">
                    <div className="font-semibold text-slate-800 max-w-[180px] truncate">{r.customer_name || '—'}</div>
                  </td>
                  <td className="td text-xs text-slate-500 whitespace-nowrap">{r.vat_number || '—'}</td>
                  <td className="td max-w-[140px]">
                    <div className="text-xs text-slate-600 truncate">{r.service_type || '—'}</div>
                  </td>
                  <td className="td">
                    <span className={STATUS_BADGE[r.status] || 'badge-gray'}>{r.status || '—'}</span>
                  </td>
                  <td className="td text-right text-xs font-medium text-slate-600 whitespace-nowrap">
                    {r.amount_application ? fmt(r.amount_application) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="td text-right text-xs font-medium text-slate-600 whitespace-nowrap">
                    {r.amount_implementation ? fmt(r.amount_implementation) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="td min-w-[140px]">
                    {(() => {
                      const collected = parseFloat(r.income_collected || 0);
                      const target = r.approval_date
                        ? parseFloat(r.amount_application || 0) + parseFloat(r.amount_implementation || 0)
                        : parseFloat(r.amount_application || 0);
                      const pct = target > 0 ? Math.min(100, (collected / target) * 100) : 0;
                      const barColor = collected >= target && target > 0 ? '#10b981' : collected > 0 ? '#f59e0b' : '#cbd5e1';
                      return (
                        <div className="space-y-1">
                          <div className="text-xs text-slate-600 whitespace-nowrap">
                            {fmt(collected)} / {target > 0 ? fmt(target) : '—'}
                            {r.income_payment_count > 0 && <span className="ml-1 text-slate-400">({r.income_payment_count})</span>}
                          </div>
                          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
                          </div>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="td text-right text-xs font-bold whitespace-nowrap">
                    {(() => {
                      const collected = parseFloat(r.income_collected || 0);
                      const target = r.approval_date
                        ? parseFloat(r.amount_application || 0) + parseFloat(r.amount_implementation || 0)
                        : parseFloat(r.amount_application || 0);
                      const remaining = Math.max(0, target - collected);
                      return remaining > 0
                        ? <span className="text-rose-600">{fmt(remaining)}</span>
                        : <span className="text-emerald-600">—</span>;
                    })()}
                  </td>
                  <td className="td">
                    {r.sales_agent ? <span className="badge-gray">{r.sales_agent}</span> : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="td text-xs text-slate-500 whitespace-nowrap">{fmtDate(r.first_sale_date)}</td>
                  <td className="td text-xs text-slate-500 whitespace-nowrap">{fmtDate(r.approval_date)}</td>
                  <td className="td">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setModal({ open: true, record: r })} className="btn-ghost btn-sm p-2 rounded-lg">
                        <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                          <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.633 1.73a.75.75 0 0 0 .963.963l1.73-.633a2.75 2.75 0 0 0 .892-.596l4.261-4.262a1.75 1.75 0 0 0 0-2.475ZM4.75 3.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h6.5c.69 0 1.25-.56 1.25-1.25V9A.75.75 0 0 1 14 9v2.25A2.75 2.75 0 0 1 11.25 14h-6.5A2.75 2.75 0 0 1 2 11.25v-6.5A2.75 2.75 0 0 1 4.75 2H7a.75.75 0 0 1 0 1.5H4.75Z"/>
                        </svg>
                      </button>
                      <button onClick={() => setDeleteId(r.id)} className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors">
                        <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                          <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.711Z" clipRule="evenodd"/>
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={13} className="td text-center text-slate-400 py-12">
                    Δεν βρέθηκαν εγγραφές
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modal.open} onClose={() => setModal({ open: false, record: null })}
        title={modal.record ? 'Επεξεργασία Συμφωνίας' : 'Νέα Συμφωνία Υπηρεσίας'} size="lg">
        <SAForm
          record={modal.record}
          onSave={() => { setModal({ open: false, record: null }); load(); }}
          onCancel={() => setModal({ open: false, record: null })}
        />
      </Modal>

      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Επιβεβαίωση Διαγραφής" size="sm">
        <p className="text-slate-600 mb-6">Σίγουρα να διαγραφεί η συμφωνία; Η ενέργεια δεν αναιρείται.</p>
        <div className="flex justify-end gap-3">
          <button className="btn-secondary" onClick={() => setDeleteId(null)}>Ακύρωση</button>
          <button className="btn-danger" onClick={() => handleDelete(deleteId)}>Διαγραφή</button>
        </div>
      </Modal>
    </div>
  );
}
