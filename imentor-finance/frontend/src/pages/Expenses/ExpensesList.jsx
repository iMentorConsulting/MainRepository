import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import Modal from '../../components/Modal';
import ExpensesForm from './ExpensesForm';
import toast from 'react-hot-toast';

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

function CategorySummary({ data }) {
  const [expanded, setExpanded] = useState(new Set());

  const grouped = {};
  for (const r of data) {
    if (!r.amount) continue;
    const cat = r.category || 'Άγνωστο';
    if (!grouped[cat]) grouped[cat] = { total: 0, suppliers: {} };
    grouped[cat].total += parseFloat(r.amount || 0);
    const sup = r.supplier || 'Χωρίς προμηθευτή';
    grouped[cat].suppliers[sup] = (grouped[cat].suppliers[sup] || 0) + parseFloat(r.amount || 0);
  }

  const cats = Object.entries(grouped).sort((a, b) => b[1].total - a[1].total);
  if (cats.length === 0) return null;
  const grandTotal = cats.reduce((s, [, v]) => s + v.total, 0);

  const toggle = cat => setExpanded(s => { const n = new Set(s); n.has(cat) ? n.delete(cat) : n.add(cat); return n; });

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <h3 className="section-title mb-0">Σύνολο ανά Κατηγορία</h3>
        <span className="text-sm font-bold text-rose-600">{fmt(grandTotal)}</span>
      </div>
      <div className="divide-y divide-slate-50">
        {cats.map(([cat, { total, suppliers }]) => {
          const pct = grandTotal > 0 ? (total / grandTotal) * 100 : 0;
          const isOpen = expanded.has(cat);
          return (
            <div key={cat}>
              <button className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors text-left group"
                onClick={() => toggle(cat)}>
                <div className="flex-1 flex items-center gap-3">
                  <span className="text-sm font-medium text-slate-700">{cat}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden max-w-[120px]">
                    <div className="h-full rounded-full bg-rose-400 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <span className="text-xs text-slate-400">{pct.toFixed(0)}%</span>
                <span className="text-sm font-bold text-rose-600 w-24 text-right">{fmt(total)}</span>
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
    </div>
  );
}

export default function ExpensesList() {
  const [data, setData] = useState({ total: 0, data: [] });
  const [filters, setFilters] = useState({
    year: String(now.getFullYear()),
    month: String(now.getMonth() + 1).padStart(2, '0'),
    category: '', search: '', page: 1
  });
  const [sort, setSort] = useState({ field: 'date', dir: 'DESC' });
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [hideNoAmount, setHideNoAmount] = useState(false);
  const [modal, setModal] = useState({ open: false, record: null });
  const [deleteId, setDeleteId] = useState(null);
  const [categories, setCategories] = useState([]);

  const load = useCallback(() => {
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''));
    params.sort_field = sort.field;
    params.sort_dir = sort.dir;
    if (hideNoAmount) params.hide_no_amount = 'true';
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    params.limit = 200;
    api.get('/expenses', { params }).then(r => setData(r.data));
  }, [filters, sort, hideNoAmount, dateFrom, dateTo]);

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

  const years = Array.from({ length: 8 }, (_, i) => now.getFullYear() - i);
  const months = ['01','02','03','04','05','06','07','08','09','10','11','12'];
  const monthNames = ['Ιαν','Φεβ','Μαρ','Απρ','Μαι','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];
  const pageTotal = data.data.reduce((a, r) => a + parseFloat(r.amount || 0), 0);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Έξοδα</h1>
          <p className="page-sub">{data.total.toLocaleString('el-GR')} εγγραφές σύνολο</p>
        </div>
        <button className="btn-primary" onClick={() => setModal({ open: true, record: null })}>
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z"/></svg>
          Νέα Εγγραφή
        </button>
      </div>

      <div className="filter-bar">
        <div className="relative flex-1 min-w-[160px]">
          <input className="input pl-9" placeholder="Αναζήτηση…" value={filters.search}
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
        <button className="btn-ghost btn-sm" onClick={() => { setFilters({ year: String(now.getFullYear()), month: String(now.getMonth()+1).padStart(2,'0'), category: '', search: '', page: 1 }); setHideNoAmount(false); setDateFrom(''); setDateTo(''); }}>
          ✕ Καθαρισμός
        </button>
      </div>

      <div className="card p-4 flex items-center gap-3 border-l-4 border-rose-400">
        <div>
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">Σύνολο σελίδας</div>
          <div className="text-xl font-black text-rose-600">{fmt(pageTotal)}</div>
        </div>
      </div>

      <CategorySummary data={data.data} />

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
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

      <Modal open={modal.open} onClose={() => setModal({ open: false, record: null })}
        title={modal.record ? 'Επεξεργασία Εξόδου' : 'Νέα Εγγραφή Εξόδου'} size="md">
        <ExpensesForm record={modal.record}
          onSave={() => { setModal({ open: false, record: null }); load(); }}
          onCancel={() => setModal({ open: false, record: null })} />
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
