import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import Modal from '../../components/Modal';
import ExpensesForm from './ExpensesForm';
import toast from 'react-hot-toast';

const fmt = n => n ? Number(n).toLocaleString('el-GR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €' : '—';
const fmtDate = d => d ? new Date(d).toLocaleDateString('el-GR') : '—';

export default function ExpensesList() {
  const [data, setData] = useState({ total: 0, data: [] });
  const [filters, setFilters] = useState({ year: '', month: '', category: '', search: '', page: 1 });
  const [modal, setModal] = useState({ open: false, record: null });
  const [deleteId, setDeleteId] = useState(null);
  const [categories, setCategories] = useState([]);

  const load = useCallback(() => {
    const params = Object.fromEntries(Object.entries(filters).filter(([,v]) => v !== ''));
    api.get('/expenses', { params }).then(r => setData(r.data));
  }, [filters]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get('/lists?list_type=ΚΑΤΗΓΟΡΙΕΣ_ΕΞΟΔΩΝ&active_only=true').then(r => setCategories(r.data.map(x=>x.value)));
  }, []);

  const handleDelete = async id => {
    try {
      await api.delete(`/expenses/${id}`);
      toast.success('Διαγράφηκε');
      setDeleteId(null); load();
    } catch { toast.error('Σφάλμα διαγραφής'); }
  };

  const years = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i);
  const months = ['01','02','03','04','05','06','07','08','09','10','11','12'];
  const monthNames = ['Ιαν','Φεβ','Μαρ','Απρ','Μαι','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];

  const total = data.data.reduce((a, r) => a + parseFloat(r.amount || 0), 0);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Έξοδα</h1>
          <div className="text-sm text-gray-500 mt-0.5">{data.total} εγγραφές</div>
        </div>
        <button className="btn-primary" onClick={() => setModal({ open: true, record: null })}>
          + Νέα Εγγραφή
        </button>
      </div>

      <div className="card p-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <input className="input" placeholder="Αναζήτηση…" value={filters.search}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value, page: 1 }))} />
          <select className="input" value={filters.year} onChange={e => setFilters(f => ({ ...f, year: e.target.value, page: 1 }))}>
            <option value="">Όλα τα έτη</option>
            {years.map(y => <option key={y}>{y}</option>)}
          </select>
          <select className="input" value={filters.month} onChange={e => setFilters(f => ({ ...f, month: e.target.value, page: 1 }))}>
            <option value="">Όλοι οι μήνες</option>
            {months.map((m,i) => <option key={m} value={m}>{monthNames[i]}</option>)}
          </select>
          <select className="input" value={filters.category} onChange={e => setFilters(f => ({ ...f, category: e.target.value, page: 1 }))}>
            <option value="">Όλες οι κατηγορίες</option>
            {categories.map(c => <option key={c}>{c}</option>)}
          </select>
          <button className="btn-secondary" onClick={() => setFilters({ year:'',month:'',category:'',search:'',page:1 })}>
            Καθαρισμός
          </button>
        </div>
      </div>

      <div className="card p-4 border-l-4 border-red-500">
        <div className="text-sm text-gray-500">Σύνολο Εξόδων (σελίδα)</div>
        <div className="text-xl font-bold text-red-600">{fmt(total)}</div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Ημερομηνία','Κατηγορία','Προμηθευτής','Υπηρεσία','Αιτιολογία','Ποσό','Ενέργειες'].map(h => (
                  <th key={h} className="table-head table-cell">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.data.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="table-cell whitespace-nowrap">{fmtDate(r.date)}</td>
                  <td className="table-cell"><span className="badge bg-orange-100 text-orange-800">{r.category || '—'}</span></td>
                  <td className="table-cell">{r.supplier || '—'}</td>
                  <td className="table-cell text-xs text-gray-500">{r.related_service || '—'}</td>
                  <td className="table-cell max-w-[200px]"><div className="truncate text-sm text-gray-500">{r.description || '—'}</div></td>
                  <td className="table-cell font-semibold text-red-600 whitespace-nowrap">{fmt(r.amount)}</td>
                  <td className="table-cell">
                    <div className="flex gap-2">
                      <button onClick={() => setModal({ open: true, record: r })} className="text-primary-600 hover:text-primary-800 text-sm">✏️</button>
                      <button onClick={() => setDeleteId(r.id)} className="text-red-500 hover:text-red-700 text-sm">🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
              {data.data.length === 0 && (
                <tr><td colSpan={7} className="table-cell text-center text-gray-400 py-8">Δεν βρέθηκαν εγγραφές</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t flex items-center justify-between text-sm text-gray-500">
          <span>Σελίδα {filters.page} · {data.total} σύνολο</span>
          <div className="flex gap-2">
            <button disabled={filters.page <= 1} onClick={() => setFilters(f => ({ ...f, page: f.page-1 }))}
              className="btn-secondary btn-sm disabled:opacity-40">← Πρηγ.</button>
            <button disabled={filters.page * 50 >= data.total} onClick={() => setFilters(f => ({ ...f, page: f.page+1 }))}
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
        <p className="text-gray-600 mb-6">Σίγουρα να διαγραφεί η εγγραφή;</p>
        <div className="flex justify-end gap-3">
          <button className="btn-secondary" onClick={() => setDeleteId(null)}>Ακύρωση</button>
          <button className="btn-danger" onClick={() => handleDelete(deleteId)}>Διαγραφή</button>
        </div>
      </Modal>
    </div>
  );
}
