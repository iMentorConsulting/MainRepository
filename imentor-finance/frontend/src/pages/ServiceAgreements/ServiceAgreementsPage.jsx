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
const fmtK = n => {
  if (!n) return '—';
  const abs = Math.abs(n);
  if (abs >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k €';
  return Math.round(n) + ' €';
};
const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

const STATUS_BADGE = {
  'ΕΝ ΕΞΕΛΙΞΕΙ':           'badge-green',
  'ΟΛΟΚΛΗΡΩΜΕΝΕΣ ΕΠΙΤΥΧΩΣ':'badge-blue',
  'ΟΛΟΚΛΗΡΩΜΕΝΕΣ FAIL':    'badge-red',
};

const STATUS_OPTS = ['ΕΝ ΕΞΕΛΙΞΕΙ', 'ΟΛΟΚΛΗΡΩΜΕΝΕΣ ΕΠΙΤΥΧΩΣ', 'ΟΛΟΚΛΗΡΩΜΕΝΕΣ FAIL'];

const STATUS_CELL_BG = {
  'ΕΝ ΕΞΕΛΙΞΕΙ':            '#dcfce7',
  'ΟΛΟΚΛΗΡΩΜΕΝΕΣ ΕΠΙΤΥΧΩΣ':'#dbeafe',
  'ΟΛΟΚΛΗΡΩΜΕΝΕΣ FAIL':     '#ffe4e6',
};
const STATUS_TEXT_COLOR = {
  'ΕΝ ΕΞΕΛΙΞΕΙ':            '#166534',
  'ΟΛΟΚΛΗΡΩΜΕΝΕΣ ΕΠΙΤΥΧΩΣ':'#1e40af',
  'ΟΛΟΚΛΗΡΩΜΕΝΕΣ FAIL':     '#9f1239',
};

const EMPTY_FORM = {
  customer_id: '', customer_name: '', vat_number: '', service_type: '',
  status: 'ΕΝ ΕΞΕΛΙΞΕΙ', amount_application: '', amount_implementation: '',
  approval_date: '', completion_deadline: '', investment_height: '', total_debts: '',
  sales_agent: '', folder_agent: '', source_referral: '', targeting_category: '', description: '',
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
    setForm(f => ({ ...f, customer_name: c.name, vat_number: c.vat_number || f.vat_number, customer_id: c.id || '' }));
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
    } finally { setSaving(false); }
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

// ── Pivot Table ───────────────────────────────────────────────────────────────
function PivotTable({ data, loading, onCellClick }) {
  if (loading) return <div className="p-12 text-center text-slate-400 text-sm">Φόρτωση ανάλυσης...</div>;
  if (!data.length) return <div className="p-12 text-center text-slate-400 text-sm">Δεν υπάρχουν δεδομένα</div>;

  const services = [...new Set(data.map(r => r.service_type))].sort((a, b) => a.localeCompare(b, 'el'));
  const matrix = {};
  data.forEach(r => {
    if (!matrix[r.service_type]) matrix[r.service_type] = {};
    matrix[r.service_type][r.status] = { cnt: parseInt(r.cnt), sumApp: parseFloat(r.sum_application) };
  });

  const colTotals = {};
  STATUS_OPTS.forEach(s => {
    colTotals[s] = data.filter(r => r.status === s).reduce((sum, r) => sum + parseInt(r.cnt), 0);
  });
  const grandTotal = data.reduce((sum, r) => sum + parseInt(r.cnt), 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b-2 border-slate-200">
            <th className="text-left py-3 px-4 text-sm font-bold text-slate-600 min-w-[160px] sticky left-0 bg-white z-10">Υπηρεσία</th>
            {STATUS_OPTS.map(s => (
              <th key={s} className="text-center py-2 px-3 text-[11px] font-bold whitespace-nowrap"
                style={{ color: STATUS_TEXT_COLOR[s], background: STATUS_CELL_BG[s] + 'aa' }}>
                {s}
              </th>
            ))}
            <th className="text-center py-3 px-4 text-sm font-bold text-slate-600 bg-slate-100 whitespace-nowrap">Σύνολο</th>
          </tr>
        </thead>
        <tbody>
          {services.map(svc => {
            const rowTotal = STATUS_OPTS.reduce((sum, s) => sum + (matrix[svc]?.[s]?.cnt || 0), 0);
            return (
              <tr key={svc} className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors">
                <td className="py-3 px-4 font-semibold text-slate-800 text-sm sticky left-0 bg-white">
                  <span className="block max-w-[200px] truncate" title={svc}>{svc}</span>
                </td>
                {STATUS_OPTS.map(s => {
                  const cell = matrix[svc]?.[s];
                  return (
                    <td key={s} className="text-center py-1.5 px-2">
                      {cell ? (
                        <button
                          onClick={() => onCellClick(svc, s)}
                          className="flex flex-col items-center gap-0.5 mx-auto px-3 py-1.5 rounded-xl transition-all hover:shadow-md hover:scale-105 active:scale-95 cursor-pointer"
                          style={{ background: STATUS_CELL_BG[s] + '70' }}
                          title={`${cell.cnt} συμφωνίες — κλικ για λεπτομέρειες`}
                        >
                          <span className="text-xl font-black leading-none" style={{ color: STATUS_TEXT_COLOR[s] }}>{cell.cnt}</span>
                          {cell.sumApp > 0 && <span className="text-[10px] text-slate-400 whitespace-nowrap">{fmtK(cell.sumApp)}</span>}
                        </button>
                      ) : (
                        <span className="text-slate-200 text-lg select-none">·</span>
                      )}
                    </td>
                  );
                })}
                <td className="text-center py-3 px-4 bg-slate-50">
                  <span className="text-lg font-black text-slate-700">{rowTotal}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-300 bg-slate-50">
            <td className="py-3 px-4 font-bold text-slate-700 sticky left-0 bg-slate-50">Σύνολο</td>
            {STATUS_OPTS.map(s => (
              <td key={s} className="text-center py-3 px-3 font-bold text-slate-700">
                {colTotals[s] > 0 ? colTotals[s] : <span className="text-slate-300">—</span>}
              </td>
            ))}
            <td className="text-center py-3 px-4 bg-slate-100">
              <span className="text-2xl font-black text-slate-800">{grandTotal}</span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ServiceAgreementsPage() {
  // List tab state
  const [data, setData] = useState({ data: [], total: 0 });
  const [filters, setFilters] = useState({ search: '', status: '', sales_agent: '', service_type: '' });
  const [sort, setSort] = useState({ field: 'createdAt', dir: 'DESC' });
  const [selectedSaleYears, setSelectedSaleYears] = useState([]);
  const [selectedSaleMonths, setSelectedSaleMonths] = useState([]);
  const [stats, setStats] = useState({ total: 0, byStatus: {} });
  const [agents, setAgents] = useState([]);
  const [services, setServices] = useState([]);

  // Selection & bulk actions
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);

  // Bulk date tool
  const [showDateTool, setShowDateTool] = useState(false);
  const [bulkDateField, setBulkDateField] = useState('approval_date');
  const [bulkDateMode, setBulkDateMode] = useState('fixed');
  const [bulkDateValue, setBulkDateValue] = useState('');
  const [bulkDateMonths, setBulkDateMonths] = useState(6);
  const [bulkDateSaving, setBulkDateSaving] = useState(false);

  // Modals
  const [modal, setModal] = useState({ open: false, record: null });
  const [deleteId, setDeleteId] = useState(null);

  // Tabs
  const [activeTab, setActiveTab] = useState('list');

  // Pivot tab
  const [pivotData, setPivotData] = useState([]);
  const [pivotLoading, setPivotLoading] = useState(false);
  const [pivotCell, setPivotCell] = useState(null);
  const [pivotCellLoading, setPivotCellLoading] = useState(false);
  const [pivotFilters, setPivotFilters] = useState({ service_types: [], statuses: [], years: [], months: [] });

  // Missing dates tab
  const [missingData, setMissingData] = useState([]);
  const [missingLoading, setMissingLoading] = useState(false);
  const [missingFilters, setMissingFilters] = useState({ service_types: [], years: [], months: [] });

  // CM sync
  const [syncModal, setSyncModal] = useState(false);
  const [syncPreview, setSyncPreview] = useState(null); // { stats, rows }
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncApplying, setSyncApplying] = useState(false);
  const [syncField, setSyncField] = useState('both');
  const [syncOverwrite, setSyncOverwrite] = useState(false);

  const handleSort = field => {
    setSort(s => s.field === field ? { field, dir: s.dir === 'DESC' ? 'ASC' : 'DESC' } : { field, dir: 'DESC' });
  };

  const load = useCallback(() => {
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''));
    params.limit = 200;
    params.sort_field = sort.field;
    params.sort_dir = sort.dir;
    if (selectedSaleYears.length === 1) params.sale_year = selectedSaleYears[0];
    else if (selectedSaleYears.length > 1) params.sale_years = selectedSaleYears.join(',');
    if (selectedSaleMonths.length === 1) params.sale_month = selectedSaleMonths[0];
    else if (selectedSaleMonths.length > 1) params.sale_months = selectedSaleMonths.join(',');
    api.get('/service-agreements', { params })
      .then(r => setData(r.data))
      .catch(err => toast.error('Σφάλμα φόρτωσης: ' + (err.response?.data?.error || err.message)));
  }, [filters, sort, selectedSaleYears, selectedSaleMonths]);

  const loadPivot = useCallback(() => {
    setPivotLoading(true);
    const p = {};
    if (pivotFilters.service_types.length) p.service_types = pivotFilters.service_types.join(',');
    if (pivotFilters.statuses.length) p.statuses = pivotFilters.statuses.join(',');
    if (pivotFilters.years.length) p.years = pivotFilters.years.join(',');
    if (pivotFilters.months.length) p.months = pivotFilters.months.join(',');
    api.get('/service-agreements/pivot', { params: p })
      .then(r => setPivotData(r.data))
      .catch(() => {})
      .finally(() => setPivotLoading(false));
  }, [pivotFilters]);

  const loadMissing = useCallback(() => {
    setMissingLoading(true);
    const p = { missing_dates: 'true', limit: 500, sort_field: 'createdAt', sort_dir: 'DESC' };
    if (missingFilters.service_types.length) p.service_type = missingFilters.service_types.join(',');
    if (missingFilters.years.length) { p.sale_years = missingFilters.years.join(','); }
    if (missingFilters.months.length) { p.sale_months = missingFilters.months.join(','); }
    api.get('/service-agreements', { params: p })
      .then(r => setMissingData(r.data.data || []))
      .catch(() => {})
      .finally(() => setMissingLoading(false));
  }, [missingFilters]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (activeTab === 'pivot') loadPivot(); }, [pivotFilters]);
  useEffect(() => { if (activeTab === 'missing') loadMissing(); }, [missingFilters]);

  useEffect(() => {
    api.get('/service-agreements/stats').then(r => setStats(r.data)).catch(() => {});
    api.get('/lists?list_type=ΠΡΑΚΤΟΡΕΣ&active_only=true').then(r => setAgents(r.data.map(x => x.value))).catch(() => {});
    api.get('/lists?list_type=ΕΙΔΟΣ_ΥΠΗΡΕΣΙΑΣ&active_only=true').then(r => setServices(r.data.map(x => x.value))).catch(() => {});
  }, []);

  useEffect(() => {
    if (activeTab === 'pivot') loadPivot();
    if (activeTab === 'missing') loadMissing();
  }, [activeTab, loadPivot, loadMissing]);

  const handleSyncPreview = async () => {
    setSyncLoading(true);
    try {
      const r = await api.get('/cm-cases/preview');
      setSyncPreview(r.data);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Σφάλμα σύνδεσης με το consult.i-mentor.gr');
    } finally { setSyncLoading(false); }
  };

  const handleSyncApply = async () => {
    setSyncApplying(true);
    try {
      const r = await api.post('/cm-cases/apply', { field: syncField, overwrite: syncOverwrite });
      toast.success(`Ενημερώθηκαν ${r.data.updated} συμφωνίες (${r.data.skipped} παρελείφθησαν)`);
      setSyncModal(false);
      setSyncPreview(null);
      load();
      if (activeTab === 'missing') loadMissing();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Σφάλμα εφαρμογής');
    } finally { setSyncApplying(false); }
  };

  const handlePivotCellClick = async (service_type, status) => {
    setPivotCellLoading(true);
    try {
      const r = await api.get('/service-agreements', { params: { service_type, status, limit: 500, sort_field: 'customer_name', sort_dir: 'ASC' } });
      setPivotCell({ service_type, status, items: r.data.data || [] });
    } catch { toast.error('Σφάλμα φόρτωσης λεπτομερειών'); }
    finally { setPivotCellLoading(false); }
  };

  // Select-all operates on whichever tab is active
  const activeRows = activeTab === 'missing' ? missingData : (data.data || []);
  const allVisibleIds = activeRows.map(r => r.id);
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
      if (activeTab === 'missing') loadMissing();
      if (activeTab === 'pivot') loadPivot();
    } catch { toast.error('Σφάλμα μαζικής ενημέρωσης'); }
    finally { setBulkSaving(false); }
  };

  const handleBulkDates = async () => {
    if (selectedIds.size === 0) return;
    if (bulkDateMode === 'fixed' && !bulkDateValue) { toast.error('Επιλέξτε ημερομηνία'); return; }
    setBulkDateSaving(true);
    try {
      const payload = { ids: [...selectedIds], field: bulkDateField, mode: bulkDateMode };
      if (bulkDateMode === 'fixed') payload.value = bulkDateValue;
      else payload.months = bulkDateMonths;
      const r = await api.post('/service-agreements/bulk-dates', payload);
      const skippedMsg = r.data.skipped > 0 ? ` (${r.data.skipped} παρελείφθησαν — έλλειψη βάσης)` : '';
      toast.success(`Ενημερώθηκαν ${r.data.updated} ημερομηνίες${skippedMsg}`);
      setSelectedIds(new Set());
      setShowDateTool(false);
      load();
      if (activeTab === 'missing') loadMissing();
      if (activeTab === 'pivot') loadPivot();
    } catch (e) { toast.error(e.response?.data?.error || 'Σφάλμα ενημέρωσης ημερομηνιών'); }
    finally { setBulkDateSaving(false); }
  };

  const handleDelete = async id => {
    try {
      await api.delete(`/service-agreements/${id}`);
      toast.success('Διαγράφηκε');
      setDeleteId(null);
      load();
      if (activeTab === 'missing') loadMissing();
    } catch { toast.error('Σφάλμα διαγραφής'); }
  };

  const rows = data.data || [];
  const sums = data.sums || { application: 0, implementation: 0, collected: 0 };
  const fByStatus = data.byStatus || {};

  const ActionBtns = ({ r }) => (
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
  );

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Συμφωνίες Υπηρεσιών</h1>
          <p className="page-sub">{data.total} εγγραφές (φίλτρο) · {stats.total} σύνολο</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setSyncModal(true); setSyncPreview(null); }}
            className="btn-secondary flex items-center gap-2">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H3.989a.75.75 0 0 0-.75.75v4.242a.75.75 0 0 0 1.5 0v-2.43l.31.31a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm1.23-3.723a.75.75 0 0 0 .219-.53V2.929a.75.75 0 0 0-1.5 0V5.36l-.31-.31A7 7 0 0 0 3.239 8.188a.75.75 0 1 0 1.448.389A5.5 5.5 0 0 1 13.89 6.11l.311.31h-2.432a.75.75 0 0 0 0 1.5h4.243a.75.75 0 0 0 .53-.219Z" clipRule="evenodd"/>
            </svg>
            Συγχρονισμός CM
          </button>
          <button className="btn-primary" onClick={() => setModal({ open: true, record: null })}>
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z"/>
            </svg>
            Νέα Συμφωνία
          </button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
        <div className="card p-4 border-l-4 border-slate-400">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Σύνολο</div>
          <div className="text-2xl font-black text-slate-600">{data.total}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">{stats.total} συνολικά</div>
        </div>
        <div className="card p-4 border-l-4 border-emerald-400">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Ενεργές</div>
          <div className="text-2xl font-black text-emerald-600">{fByStatus['ΕΝ ΕΞΕΛΙΞΕΙ'] || 0}</div>
        </div>
        <div className="card p-4 border-l-4 border-blue-400">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Ολοκληρωμένες</div>
          <div className="text-2xl font-black text-blue-600">
            {fByStatus['ΟΛΟΚΛΗΡΩΜΕΝΕΣ ΕΠΙΤΥΧΩΣ'] || 0}
          </div>
        </div>
        <div className="card p-4 border-l-4 border-indigo-400">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Σύνολο Αιτήσεων</div>
          <div className="text-2xl font-black text-indigo-600">{fmtK(sums.application)}</div>
        </div>
        <div className="card p-4 border-l-4 border-violet-400">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Σύνολο Υλοποιήσεων</div>
          <div className="text-2xl font-black text-violet-600">{fmtK(sums.implementation)}</div>
        </div>
        <div className="card p-4 border-l-4 border-teal-400">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Σύνολο Εισπράξεων</div>
          <div className="text-2xl font-black text-teal-600">{fmtK(sums.collected)}</div>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-0 border-b border-slate-200 -mb-1 overflow-x-auto">
        {[
          { key: 'list',    label: 'Λίστα',                  badge: data.total },
          { key: 'pivot',   label: 'Ανάλυση ανά Υπηρεσία' },
          { key: 'missing', label: 'Χωρίς Ημερομηνίες',      badge: missingData.length, alert: true },
        ].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap
              ${activeTab === t.key
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {t.label}
            {t.badge > 0 && (
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full
                ${t.alert && t.badge > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Filter bar — list tab only */}
      {activeTab === 'list' && (
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
            <MultiSelectDropdown label="Έτος" options={YEAR_OPTS} selected={selectedSaleYears}
              onChange={setSelectedSaleYears} getKey={o => o.value} getLabel={o => o.value} />
            <MultiSelectDropdown label="Μήνας" options={MONTH_OPTS} selected={selectedSaleMonths}
              onChange={setSelectedSaleMonths} getKey={o => o.value} getLabel={o => o.label} />
          </div>
          <button className="btn-ghost btn-sm" onClick={() => {
            setFilters({ search: '', status: '', sales_agent: '', service_type: '' });
            setSelectedSaleYears([]); setSelectedSaleMonths([]);
          }}>✕ Καθαρισμός</button>
        </div>
      )}

      {/* Bulk actions bar */}
      {selectedIds.size > 0 && (
        <div className="px-4 py-3 rounded-xl bg-indigo-50 border border-indigo-200 animate-slide-up space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-bold text-indigo-700 shrink-0">{selectedIds.size} επιλεγμένες</span>
            <div className="flex-1" />
            {/* Bulk status */}
            <select className="input w-52 text-sm" value={bulkStatus} onChange={e => setBulkStatus(e.target.value)}>
              <option value="">— Νέα Κατάσταση —</option>
              {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button className="btn-primary text-sm px-4 py-2 disabled:opacity-50" disabled={!bulkStatus || bulkSaving} onClick={handleBulkStatus}>
              {bulkSaving ? 'Εφαρμογή…' : 'Εφαρμογή'}
            </button>
            <div className="w-px h-6 bg-indigo-200 shrink-0" />
            {/* Date tool toggle */}
            <button onClick={() => setShowDateTool(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${showDateTool ? 'bg-indigo-200 text-indigo-800' : 'bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-100'}`}>
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M5.75 2a.75.75 0 0 1 .75.75V4h7V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 18 6.75v8.5A2.75 2.75 0 0 1 15.25 18H4.75A2.75 2.75 0 0 1 2 15.25v-8.5A2.75 2.75 0 0 1 4.75 4H5V2.75A.75.75 0 0 1 5.75 2Zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75Z" clipRule="evenodd"/>
              </svg>
              Μαζικές Ημερομηνίες
            </button>
            <button className="btn-ghost btn-sm text-slate-500" onClick={() => { setSelectedIds(new Set()); setShowDateTool(false); }}>
              ✕ Αποεπιλογή
            </button>
          </div>

          {/* Date tool panel */}
          {showDateTool && (
            <div className="pt-3 border-t border-indigo-200 flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-semibold text-indigo-600 mb-1">Πεδίο</label>
                <select value={bulkDateField} onChange={e => setBulkDateField(e.target.value)} className="input w-48 text-sm">
                  <option value="approval_date">Ημ. Έγκρισης</option>
                  <option value="completion_deadline">Προθεσμία Ολοκλήρωσης</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-indigo-600 mb-1">Τρόπος υπολογισμού</label>
                <select value={bulkDateMode} onChange={e => setBulkDateMode(e.target.value)} className="input w-56 text-sm">
                  <option value="fixed">Συγκεκριμένη ημερομηνία</option>
                  <option value="months_after_agreement">+ X μήνες από Ημ. Συμφωνίας</option>
                  <option value="months_after_approval">+ X μήνες από Ημ. Έγκρισης</option>
                </select>
              </div>
              {bulkDateMode === 'fixed' ? (
                <div>
                  <label className="block text-xs font-semibold text-indigo-600 mb-1">Ημερομηνία</label>
                  <input type="date" value={bulkDateValue} onChange={e => setBulkDateValue(e.target.value)} className="input w-40 text-sm" />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-indigo-600 mb-1">Αριθμός μηνών</label>
                  <input type="number" min={1} max={120} value={bulkDateMonths}
                    onChange={e => setBulkDateMonths(e.target.value)} className="input w-28 text-sm" />
                </div>
              )}
              <button onClick={handleBulkDates} disabled={bulkDateSaving}
                className="btn-primary text-sm disabled:opacity-50">
                {bulkDateSaving ? 'Εφαρμογή…' : `Ορισμός σε ${selectedIds.size} συμφωνίες`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── LIST TAB ──────────────────────────────────────────────────────── */}
      {activeTab === 'list' && (
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
                        const target = parseFloat(r.amount_application || 0) + parseFloat(r.amount_implementation || 0);
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
                        const target = parseFloat(r.amount_application || 0) + parseFloat(r.amount_implementation || 0);
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
                    <td className="td"><ActionBtns r={r} /></td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={13} className="td text-center text-slate-400 py-12">Δεν βρέθηκαν εγγραφές</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── PIVOT TAB ─────────────────────────────────────────────────────── */}
      {activeTab === 'pivot' && (
        <div className="space-y-3">
          {/* Filter bar */}
          <div className="filter-bar flex-wrap gap-2">
            <MultiSelectDropdown label="Υπηρεσία" options={(services || []).map(s => ({ value: s }))}
              selected={pivotFilters.service_types}
              onChange={v => setPivotFilters(f => ({ ...f, service_types: v }))} />
            <MultiSelectDropdown label="Κατάσταση" options={STATUS_OPTS.map(s => ({ value: s }))}
              selected={pivotFilters.statuses}
              onChange={v => setPivotFilters(f => ({ ...f, statuses: v }))} />
            <MultiSelectDropdown label="Έτος" options={YEAR_OPTS}
              selected={pivotFilters.years}
              onChange={v => setPivotFilters(f => ({ ...f, years: v }))} />
            <MultiSelectDropdown label="Μήνας" options={MONTH_OPTS}
              selected={pivotFilters.months}
              onChange={v => setPivotFilters(f => ({ ...f, months: v }))} />
            {(pivotFilters.service_types.length || pivotFilters.statuses.length || pivotFilters.years.length || pivotFilters.months.length) ? (
              <button className="btn-ghost btn-sm text-xs" onClick={() => setPivotFilters({ service_types: [], statuses: [], years: [], months: [] })}>✕ Καθαρισμός</button>
            ) : null}
            <button onClick={loadPivot} disabled={pivotLoading} className="btn-secondary btn-sm ml-auto">
              {pivotLoading ? 'Φόρτωση…' : '↺ Ανανέωση'}
            </button>
          </div>
          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100">
              <div className="font-bold text-slate-800">Κατανομή ανά Υπηρεσία & Κατάσταση</div>
              <div className="text-xs text-slate-400 mt-0.5">Κλικ σε κελί για να δείτε τις συμφωνίες</div>
            </div>
            <PivotTable data={pivotData} loading={pivotLoading} onCellClick={handlePivotCellClick} />
          </div>
        </div>
      )}

      {/* ── MISSING DATES TAB ─────────────────────────────────────────────── */}
      {activeTab === 'missing' && (
        <div className="space-y-3">
          {/* Filter bar */}
          <div className="filter-bar flex-wrap gap-2">
            <MultiSelectDropdown label="Υπηρεσία" options={(services || []).map(s => ({ value: s }))}
              selected={missingFilters.service_types}
              onChange={v => setMissingFilters(f => ({ ...f, service_types: v }))} />
            <MultiSelectDropdown label="Έτος" options={YEAR_OPTS}
              selected={missingFilters.years}
              onChange={v => setMissingFilters(f => ({ ...f, years: v }))} />
            <MultiSelectDropdown label="Μήνας" options={MONTH_OPTS}
              selected={missingFilters.months}
              onChange={v => setMissingFilters(f => ({ ...f, months: v }))} />
            {(missingFilters.service_types.length || missingFilters.years.length || missingFilters.months.length) ? (
              <button className="btn-ghost btn-sm text-xs" onClick={() => setMissingFilters({ service_types: [], years: [], months: [] })}>✕ Καθαρισμός</button>
            ) : null}
            <button onClick={loadMissing} disabled={missingLoading} className="btn-secondary btn-sm ml-auto">
              {missingLoading ? 'Φόρτωση…' : '↺ Ανανέωση'}
            </button>
          </div>
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <div className="font-bold text-slate-800 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                Συμφωνίες χωρίς Ημ. Έγκρισης ή Προθεσμία
                {missingData.length > 0 && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{missingData.length}</span>
                )}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">Επιλέξτε γραμμές και χρησιμοποιήστε "Μαζικές Ημερομηνίες" για μαζική συμπλήρωση</div>
            </div>
          </div>
          {missingLoading ? (
            <div className="p-12 text-center text-slate-400 text-sm">Φόρτωση...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th w-10 pr-0">
                      <input type="checkbox" checked={allSelected} onChange={toggleSelectAll}
                        className="w-4 h-4 rounded border-slate-300 text-primary-600 cursor-pointer" />
                    </th>
                    <th className="th">Πελάτης</th>
                    <th className="th">Υπηρεσία</th>
                    <th className="th">Κατάσταση</th>
                    <th className="th">Σύμβουλος</th>
                    <th className="th">Ημ. Συμφωνίας</th>
                    <th className="th">Ημ. Έγκρισης</th>
                    <th className="th">Προθεσμία Ολοκλήρωσης</th>
                    <th className="th w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {missingData.map(r => {
                    const missingApproval = !r.approval_date;
                    const missingDeadline = !r.completion_deadline;
                    return (
                      <tr key={r.id} className={`tr ${selectedIds.has(r.id) ? 'bg-indigo-50/60' : ''}`}>
                        <td className="td pr-0">
                          <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleOne(r.id)}
                            className="w-4 h-4 rounded border-slate-300 text-primary-600 cursor-pointer" />
                        </td>
                        <td className="td">
                          <div className="font-semibold text-slate-800 max-w-[180px] truncate">{r.customer_name || '—'}</div>
                          {r.vat_number && <div className="text-[11px] text-slate-400">{r.vat_number}</div>}
                        </td>
                        <td className="td">
                          <div className="text-xs text-slate-600 max-w-[140px] truncate">{r.service_type || '—'}</div>
                        </td>
                        <td className="td">
                          <span className={STATUS_BADGE[r.status] || 'badge-gray'}>{r.status || '—'}</span>
                        </td>
                        <td className="td">
                          {r.sales_agent ? <span className="badge-gray">{r.sales_agent}</span> : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="td text-xs text-slate-500 whitespace-nowrap">{fmtDate(r.first_sale_date)}</td>
                        <td className="td whitespace-nowrap">
                          {missingApproval ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-lg">
                              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3"><path fillRule="evenodd" d="M6.701 2.25c.577-1 2.02-1 2.598 0l5.196 9a1.5 1.5 0 0 1-1.299 2.25H2.804a1.5 1.5 0 0 1-1.3-2.25l5.197-9ZM8 6a.75.75 0 0 1 .75.75v2.5a.75.75 0 0 1-1.5 0v-2.5A.75.75 0 0 1 8 6Zm0 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd"/></svg>
                              Δεν έχει οριστεί
                            </span>
                          ) : (
                            <span className="text-xs text-emerald-600 font-medium">{fmtDate(r.approval_date)}</span>
                          )}
                        </td>
                        <td className="td whitespace-nowrap">
                          {missingDeadline ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-lg">
                              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3"><path fillRule="evenodd" d="M6.701 2.25c.577-1 2.02-1 2.598 0l5.196 9a1.5 1.5 0 0 1-1.299 2.25H2.804a1.5 1.5 0 0 1-1.3-2.25l5.197-9ZM8 6a.75.75 0 0 1 .75.75v2.5a.75.75 0 0 1-1.5 0v-2.5A.75.75 0 0 1 8 6Zm0 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd"/></svg>
                              Δεν έχει οριστεί
                            </span>
                          ) : (
                            <span className="text-xs text-emerald-600 font-medium">{fmtDate(r.completion_deadline)}</span>
                          )}
                        </td>
                        <td className="td"><ActionBtns r={r} /></td>
                      </tr>
                    );
                  })}
                  {missingData.length === 0 && (
                    <tr>
                      <td colSpan={9} className="td text-center py-12">
                        <div className="text-emerald-600 font-semibold text-sm">Όλες οι συμφωνίες έχουν συμπληρωμένες ημερομηνίες!</div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
        </div>
      )}

      {/* Edit / Create modal */}
      <Modal open={modal.open} onClose={() => setModal({ open: false, record: null })}
        title={modal.record ? 'Επεξεργασία Συμφωνίας' : 'Νέα Συμφωνία Υπηρεσίας'} size="lg">
        <SAForm
          record={modal.record}
          onSave={() => { setModal({ open: false, record: null }); load(); if (activeTab === 'missing') loadMissing(); if (activeTab === 'pivot') loadPivot(); }}
          onCancel={() => setModal({ open: false, record: null })}
        />
      </Modal>

      {/* Delete confirm modal */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Επιβεβαίωση Διαγραφής" size="sm">
        <p className="text-slate-600 mb-6">Σίγουρα να διαγραφεί η συμφωνία; Η ενέργεια δεν αναιρείται.</p>
        <div className="flex justify-end gap-3">
          <button className="btn-secondary" onClick={() => setDeleteId(null)}>Ακύρωση</button>
          <button className="btn-danger" onClick={() => handleDelete(deleteId)}>Διαγραφή</button>
        </div>
      </Modal>

      {/* Pivot cell drill-down modal */}
      <Modal open={!!pivotCell} onClose={() => setPivotCell(null)}
        title={pivotCell ? `${pivotCell.service_type} — ${pivotCell.status} (${pivotCell.items.length})` : ''}
        size="xl">
        {pivotCell && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="th">Πελάτης</th>
                  <th className="th">ΑΦΜ</th>
                  <th className="th text-right">Αίτηση</th>
                  <th className="th text-right">Υλοποίηση</th>
                  <th className="th text-right">Είσπραξη</th>
                  <th className="th">Σύμβουλος</th>
                  <th className="th">Ημ. Συμφωνίας</th>
                  <th className="th">Ημ. Έγκρισης</th>
                  <th className="th">Προθεσμία</th>
                  <th className="th w-16"></th>
                </tr>
              </thead>
              <tbody>
                {pivotCell.items.length === 0 && (
                  <tr><td colSpan={10} className="td text-center text-slate-400 py-8">Δεν βρέθηκαν εγγραφές</td></tr>
                )}
                {pivotCell.items.map(r => (
                  <tr key={r.id} className="tr">
                    <td className="td font-semibold text-slate-800 max-w-[180px]">
                      <div className="truncate">{r.customer_name || '—'}</div>
                    </td>
                    <td className="td text-xs text-slate-500 whitespace-nowrap">{r.vat_number || '—'}</td>
                    <td className="td text-right text-xs text-slate-600 whitespace-nowrap">{fmt(r.amount_application)}</td>
                    <td className="td text-right text-xs text-slate-600 whitespace-nowrap">{fmt(r.amount_implementation)}</td>
                    <td className="td text-right text-xs font-semibold whitespace-nowrap">
                      {parseFloat(r.income_collected || 0) > 0
                        ? <span className="text-teal-600">{fmt(r.income_collected)}</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="td text-xs">{r.sales_agent || '—'}</td>
                    <td className="td text-xs text-slate-500 whitespace-nowrap">{fmtDate(r.first_sale_date)}</td>
                    <td className="td text-xs whitespace-nowrap">
                      {r.approval_date
                        ? <span className="text-slate-600">{fmtDate(r.approval_date)}</span>
                        : <span className="text-amber-500 font-semibold">—</span>}
                    </td>
                    <td className="td text-xs whitespace-nowrap">
                      {r.completion_deadline
                        ? <span className="text-slate-600">{fmtDate(r.completion_deadline)}</span>
                        : <span className="text-amber-500 font-semibold">—</span>}
                    </td>
                    <td className="td">
                      <button onClick={() => { setPivotCell(null); setModal({ open: true, record: r }); }}
                        className="btn-ghost btn-sm p-1.5 rounded-lg">
                        <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                          <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.633 1.73a.75.75 0 0 0 .963.963l1.73-.633a2.75 2.75 0 0 0 .892-.596l4.261-4.262a1.75 1.75 0 0 0 0-2.475ZM4.75 3.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h6.5c.69 0 1.25-.56 1.25-1.25V9A.75.75 0 0 1 14 9v2.25A2.75 2.75 0 0 1 11.25 14h-6.5A2.75 2.75 0 0 1 2 11.25v-6.5A2.75 2.75 0 0 1 4.75 2H7a.75.75 0 0 1 0 1.5H4.75Z"/>
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* CM Sync modal */}
      <Modal open={syncModal} onClose={() => setSyncModal(false)}
        title="Συγχρονισμός από consult.i-mentor.gr" size="xl">
        <div className="space-y-4">
          {/* Settings row */}
          <div className="flex flex-wrap items-end gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Πεδία προς ενημέρωση</label>
              <select value={syncField} onChange={e => setSyncField(e.target.value)} className="input w-52 text-sm">
                <option value="both">Ημ. Έγκρισης + Προθεσμία</option>
                <option value="approval">Μόνο Ημ. Έγκρισης</option>
                <option value="deadline">Μόνο Προθεσμία Ολοκλήρωσης</option>
              </select>
            </div>
            <label className="flex items-center gap-2 cursor-pointer pb-1">
              <input type="checkbox" checked={syncOverwrite} onChange={e => setSyncOverwrite(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-indigo-600" />
              <span className="text-sm text-slate-600">Αντικατάσταση υπαρχουσών ημερομηνιών</span>
            </label>
            <button onClick={handleSyncPreview} disabled={syncLoading}
              className="btn-secondary flex items-center gap-2">
              {syncLoading ? 'Φόρτωση…' : '↺ Φόρτωση προεπισκόπησης'}
            </button>
          </div>

          {syncPreview && (
            <>
              {/* Stats */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Σύνολο CM', val: syncPreview.stats.total_cm, color: 'text-slate-700' },
                  { label: 'Ταιριάζουν', val: syncPreview.stats.matched, color: 'text-emerald-600' },
                  { label: 'Δεν ταιριάζουν', val: syncPreview.stats.unmatched, color: 'text-amber-600' },
                  { label: 'Θα ενημερωθούν', val: syncPreview.stats.will_update, color: 'text-indigo-600' },
                ].map(s => (
                  <div key={s.label} className="card p-3 text-center">
                    <div className={`text-2xl font-black ${s.color}`}>{s.val}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Preview table */}
              <div className="overflow-x-auto max-h-96 rounded-xl border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white">
                    <tr>
                      <th className="th">CM Πελάτης</th>
                      <th className="th">CM Υπηρεσία</th>
                      <th className="th">CM Έγκριση</th>
                      <th className="th">CM Προθεσμία</th>
                      <th className="th">Finance Πελάτης</th>
                      <th className="th">Finance Έγκριση</th>
                      <th className="th">Finance Προθεσμία</th>
                      <th className="th">Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {syncPreview.rows.map((r, i) => (
                      <tr key={i} className={`tr ${r.matched ? '' : 'bg-amber-50/40'}`}>
                        <td className="td font-medium max-w-[160px] truncate">{r.cm_name}</td>
                        <td className="td text-slate-500 max-w-[120px] truncate">{r.cm_service || '—'}</td>
                        <td className="td whitespace-nowrap">{r.cm_approval_date ? fmtDate(r.cm_approval_date) : <span className="text-slate-300">—</span>}</td>
                        <td className="td whitespace-nowrap">{r.cm_deadline ? fmtDate(r.cm_deadline) : <span className="text-slate-300">—</span>}</td>
                        <td className="td text-slate-500 max-w-[160px] truncate">{r.finance_name || <span className="text-amber-500 font-semibold">Δεν βρέθηκε</span>}</td>
                        <td className="td whitespace-nowrap">{r.finance_approval ? fmtDate(r.finance_approval) : <span className="text-slate-300">—</span>}</td>
                        <td className="td whitespace-nowrap">{r.finance_deadline ? fmtDate(r.finance_deadline) : <span className="text-slate-300">—</span>}</td>
                        <td className="td text-center">{r.matched ? '✓' : <span className="text-amber-500">✗</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Apply button */}
              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button onClick={() => setSyncModal(false)} className="btn-secondary">Ακύρωση</button>
                <button onClick={handleSyncApply} disabled={syncApplying || syncPreview.stats.will_update === 0}
                  className="btn-primary disabled:opacity-50">
                  {syncApplying ? 'Εφαρμογή…' : `Εφαρμογή σε ${syncPreview.stats.will_update} συμφωνίες`}
                </button>
              </div>
            </>
          )}

          {!syncPreview && !syncLoading && (
            <div className="p-8 text-center text-slate-400 text-sm">
              Πατήστε "Φόρτωση προεπισκόπησης" για να δείτε ποια δεδομένα θα εισαχθούν.
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
