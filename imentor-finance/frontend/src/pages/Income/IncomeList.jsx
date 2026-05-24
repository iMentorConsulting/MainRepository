import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import Modal from '../../components/Modal';
import IncomeForm from './IncomeForm';
import toast from 'react-hot-toast';

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

export default function IncomeList() {
  const [data, setData] = useState({ total: 0, data: [] });
  const [filters, setFilters] = useState({
    year: String(now.getFullYear()),
    month: String(now.getMonth() + 1).padStart(2, '0'),
    service_type: '', sales_agent: '', search: '', page: 1
  });
  const [sort, setSort] = useState({ field: 'sale_date', dir: 'DESC' });
  const [modal, setModal] = useState({ open: false, record: null });
  const [deleteId, setDeleteId] = useState(null);
  const [services, setServices] = useState([]);
  const [agents, setAgents] = useState([]);

  const load = useCallback(() => {
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''));
    params.sort_field = sort.field;
    params.sort_dir = sort.dir;
    api.get('/income', { params }).then(r => setData(r.data));
  }, [filters, sort]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get('/lists?list_type=ΕΙΔΟΣ_ΥΠΗΡΕΣΙΑΣ&active_only=true').then(r => setServices(r.data.map(x => x.value)));
    api.get('/lists?list_type=ΠΡΑΚΤΟΡΕΣ&active_only=true').then(r => setAgents(r.data.map(x => x.value)));
  }, []);

  const handleSort = field => {
    setSort(s => s.field === field ? { field, dir: s.dir === 'DESC' ? 'ASC' : 'DESC' } : { field, dir: 'DESC' });
    setFilters(f => ({ ...f, page: 1 }));
  };

  const handleDelete = async id => {
    try { await api.delete(`/income/${id}`); toast.success('Διαγράφηκε'); setDeleteId(null); load(); }
    catch { toast.error('Σφάλμα διαγραφής'); }
  };

  const years = Array.from({ length: 8 }, (_, i) => now.getFullYear() - i);
  const months = ['01','02','03','04','05','06','07','08','09','10','11','12'];
  const monthNames = ['Ιαν','Φεβ','Μαρ','Απρ','Μαι','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];
  const pageTotal = data.data.reduce((a, r) => a + parseFloat(r.amount_collected || 0), 0);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Έσοδα</h1>
          <p className="page-sub">{data.total.toLocaleString('el-GR')} εγγραφές σύνολο</p>
        </div>
        <button className="btn-primary" onClick={() => setModal({ open: true, record: null })}>
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z"/></svg>
          Νέα Εγγραφή
        </button>
      </div>

      <div className="filter-bar">
        <div className="relative flex-1 min-w-[160px]">
          <input className="input pl-9" placeholder="Αναζήτηση πελάτη…" value={filters.search}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value, page: 1 }))} />
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 absolute left-3 top-3 text-slate-400">
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd"/>
          </svg>
        </div>
        <select className="input w-28" value={filters.year} onChange={e => setFilters(f => ({ ...f, year: e.target.value, page: 1 }))}>
          <option value="">Έτος</option>
          {years.map(y => <option key={y}>{y}</option>)}
        </select>
        <select className="input w-28" value={filters.month} onChange={e => setFilters(f => ({ ...f, month: e.target.value, page: 1 }))}>
          <option value="">Μήνας</option>
          {months.map((m, i) => <option key={m} value={m}>{monthNames[i]}</option>)}
        </select>
        <select className="input w-44" value={filters.service_type} onChange={e => setFilters(f => ({ ...f, service_type: e.target.value, page: 1 }))}>
          <option value="">Υπηρεσία</option>
          {services.map(s => <option key={s}>{s}</option>)}
        </select>
        <select className="input w-36" value={filters.sales_agent} onChange={e => setFilters(f => ({ ...f, sales_agent: e.target.value, page: 1 }))}>
          <option value="">Πράκτορας</option>
          {agents.map(a => <option key={a}>{a}</option>)}
        </select>
        <button className="btn-ghost btn-sm" onClick={() => setFilters({ year: String(now.getFullYear()), month: String(now.getMonth()+1).padStart(2,'0'), service_type: '', sales_agent: '', search: '', page: 1 })}>
          ✕ Καθαρισμός
        </button>
      </div>

      <div className="card p-4 flex items-center gap-3 border-l-4 border-emerald-400">
        <div>
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">Σύνολο σελίδας</div>
          <div className="text-xl font-black text-emerald-600">{fmt(pageTotal)}</div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <SortTh label="Ημερομηνία" field="sale_date" sort={sort} onSort={handleSort} />
                <SortTh label="Πελάτης" field="customer_name" sort={sort} onSort={handleSort} />
                <th className="th text-xs">ΑΦΜ</th>
                <SortTh label="Υπηρεσία" field="service_type" sort={sort} onSort={handleSort} />
                <SortTh label="Κατάσταση" field="work_status" sort={sort} onSort={handleSort} />
                <SortTh label="Πράκτορας" field="sales_agent" sort={sort} onSort={handleSort} />
                <SortTh label="Αίτ." field="amount_application" sort={sort} onSort={handleSort} className="text-right" />
                <SortTh label="Υλ." field="amount_implementation" sort={sort} onSort={handleSort} className="text-right" />
                <SortTh label="Ποσό" field="amount_collected" sort={sort} onSort={handleSort} className="text-right" />
                <th className="th w-16"></th>
              </tr>
            </thead>
            <tbody>
              {data.data.map(r => (
                <tr key={r.id} className="tr">
                  <td className="td whitespace-nowrap text-slate-500 text-xs">{fmtDate(r.sale_date)}</td>
                  <td className="td">
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
                    <div className="flex gap-1">
                      <button onClick={() => setModal({ open: true, record: r })} className="btn-ghost btn-sm p-2 rounded-lg">
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
                <tr><td colSpan={10} className="td text-center text-slate-400 py-12">
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

      <Modal open={modal.open} onClose={() => setModal({ open: false, record: null })}
        title={modal.record ? 'Επεξεργασία Εγγραφής' : 'Νέα Εγγραφή Εσόδου'} size="lg">
        <IncomeForm record={modal.record}
          onSave={() => { setModal({ open: false, record: null }); load(); }}
          onCancel={() => setModal({ open: false, record: null })} />
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
