import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import Modal from '../../components/Modal';
import IncomeForm from './IncomeForm';
import toast from 'react-hot-toast';

const fmt = n => n ? Number(n).toLocaleString('el-GR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €' : '—';
const fmtDate = d => d ? new Date(d).toLocaleDateString('el-GR') : '—';

const STATUS_COLORS = {
  'ΟΛΟΚΛΗΡΩΜΕΝΗ - ΕΠΙΤΥΧΩΣ': 'bg-green-100 text-green-800',
  'ΟΛΟΚΛΗΡΩΜΕΝΗ - ΑΠΟΡΡΙΨΗ': 'bg-red-100 text-red-800',
  'ΥΠΟΒΟΛΗ ΑΙΤΗΣΗΣ': 'bg-blue-100 text-blue-800',
  'ΔΕΝ ΠΡΟΧΩΡΗΣΕ': 'bg-gray-100 text-gray-700',
};

export default function IncomeList() {
  const [data, setData] = useState({ total: 0, data: [] });
  const [filters, setFilters] = useState({ year: '', month: '', service_type: '', sales_agent: '', search: '', page: 1 });
  const [modal, setModal] = useState({ open: false, record: null });
  const [deleteId, setDeleteId] = useState(null);
  const [services, setServices] = useState([]);
  const [agents, setAgents] = useState([]);

  const load = useCallback(() => {
    const params = Object.fromEntries(Object.entries(filters).filter(([,v]) => v !== ''));
    api.get('/income', { params }).then(r => setData(r.data));
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.get('/lists?list_type=ΕΙΔΟΣ_ΥΠΗΡΕΣΙΑΣ&active_only=true').then(r => setServices(r.data.map(x=>x.value)));
    api.get('/lists?list_type=ΠΡΑΚΤΟΡΕΣ&active_only=true').then(r => setAgents(r.data.map(x=>x.value)));
  }, []);

  const handleDelete = async id => {
    try {
      await api.delete(`/income/${id}`);
      toast.success('Διαγράφηκε');
      setDeleteId(null);
      load();
    } catch { toast.error('Σφάλμα διαγραφής'); }
  };

  const years = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i);
  const months = ['01','02','03','04','05','06','07','08','09','10','11','12'];
  const monthNames = ['Ιαν','Φεβ','Μαρ','Απρ','Μαι','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];

  const totals = data.data.reduce((a, r) => ({
    income: a.income + parseFloat(r.amount_collected || 0),
    bonus: a.bonus + parseFloat(r.bonus || 0)
  }), { income: 0, bonus: 0 });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Έσοδα</h1>
          <div className="text-sm text-gray-500 mt-0.5">{data.total} εγγραφές</div>
        </div>
        <button className="btn-primary" onClick={() => setModal({ open: true, record: null })}>
          + Νέα Εγγραφή
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <input className="input" placeholder="Αναζήτηση πελάτη…" value={filters.search}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value, page: 1 }))} />
          <select className="input" value={filters.year} onChange={e => setFilters(f => ({ ...f, year: e.target.value, page: 1 }))}>
            <option value="">Όλα τα έτη</option>
            {years.map(y => <option key={y}>{y}</option>)}
          </select>
          <select className="input" value={filters.month} onChange={e => setFilters(f => ({ ...f, month: e.target.value, page: 1 }))}>
            <option value="">Όλοι οι μήνες</option>
            {months.map((m,i) => <option key={m} value={m}>{monthNames[i]}</option>)}
          </select>
          <select className="input" value={filters.service_type} onChange={e => setFilters(f => ({ ...f, service_type: e.target.value, page: 1 }))}>
            <option value="">Όλες οι υπηρεσίες</option>
            {services.map(s => <option key={s}>{s}</option>)}
          </select>
          <select className="input" value={filters.sales_agent} onChange={e => setFilters(f => ({ ...f, sales_agent: e.target.value, page: 1 }))}>
            <option value="">Όλοι οι πράκτορες</option>
            {agents.map(a => <option key={a}>{a}</option>)}
          </select>
          <button className="btn-secondary" onClick={() => setFilters({ year:'',month:'',service_type:'',sales_agent:'',search:'',page:1 })}>
            Καθαρισμός
          </button>
        </div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card p-4 border-l-4 border-green-500">
          <div className="text-sm text-gray-500">Σύνολο Εισπράξεων (σελίδα)</div>
          <div className="text-xl font-bold">{fmt(totals.income)}</div>
        </div>
        <div className="card p-4 border-l-4 border-yellow-500">
          <div className="text-sm text-gray-500">Σύνολο Bonus (σελίδα)</div>
          <div className="text-xl font-bold">{fmt(totals.bonus)}</div>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Ημ/νία','Πελάτης','Υπηρεσία','Κατάσταση','Πράκτορας','Ποσό','ΦΠΑ','Τιμολόγιο','Ενέργειες'].map(h => (
                  <th key={h} className="table-head table-cell">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.data.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="table-cell text-gray-500 whitespace-nowrap">{fmtDate(r.sale_date)}</td>
                  <td className="table-cell font-medium max-w-[180px]">
                    <div className="truncate">{r.customer_name}</div>
                    {r.accountant && <div className="text-xs text-gray-400">Λογ: {r.accountant}</div>}
                  </td>
                  <td className="table-cell max-w-[140px]"><div className="truncate text-xs">{r.service_type}</div></td>
                  <td className="table-cell">
                    <span className={`badge ${STATUS_COLORS[r.work_status] || 'bg-gray-100 text-gray-700'}`}>
                      {r.work_status?.length > 20 ? r.work_status.slice(0,18)+'…' : (r.work_status || '—')}
                    </span>
                  </td>
                  <td className="table-cell text-sm">{r.sales_agent || '—'}</td>
                  <td className="table-cell font-semibold text-green-700 whitespace-nowrap">{fmt(r.amount_collected)}</td>
                  <td className="table-cell text-sm text-gray-500">{fmt(r.vat_amount)}</td>
                  <td className="table-cell text-xs text-gray-500">{r.invoice_number || '—'}</td>
                  <td className="table-cell">
                    <div className="flex gap-2">
                      <button onClick={() => setModal({ open: true, record: r })} className="text-primary-600 hover:text-primary-800 text-sm">✏️</button>
                      <button onClick={() => setDeleteId(r.id)} className="text-red-500 hover:text-red-700 text-sm">🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
              {data.data.length === 0 && (
                <tr><td colSpan={9} className="table-cell text-center text-gray-400 py-8">Δεν βρέθηκαν εγγραφές</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
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

      {/* Add/Edit Modal */}
      <Modal open={modal.open} onClose={() => setModal({ open: false, record: null })}
        title={modal.record ? 'Επεξεργασία Εγγραφής' : 'Νέα Εγγραφή Εσόδου'} size="lg">
        <IncomeForm
          record={modal.record}
          onSave={() => { setModal({ open: false, record: null }); load(); }}
          onCancel={() => setModal({ open: false, record: null })}
        />
      </Modal>

      {/* Delete confirm */}
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
