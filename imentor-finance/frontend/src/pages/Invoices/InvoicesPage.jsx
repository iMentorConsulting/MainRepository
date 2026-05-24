import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import api from '../../api/client';
import Modal from '../../components/Modal';
import toast from 'react-hot-toast';

const fmt = n => n ? Number(n).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €' : '—';
const fmtDate = d => d ? new Date(d).toLocaleDateString('el-GR') : '—';

function InvoiceModal({ record, onClose, onDone }) {
  const { register, handleSubmit, watch } = useForm({
    defaultValues: {
      income_id: record?.id,
      org_key: 'DEFAULT',
      amount: record?.amount_collected || '',
      description: record?.description || record?.service_type || '',
      date: new Date().toISOString().split('T')[0]
    }
  });
  const [loading, setLoading] = useState(false);

  const amount = watch('amount');
  const orgKey = watch('org_key');
  const net = amount ? (parseFloat(amount) / 1.24).toFixed(2) : 0;
  const vat = amount ? (parseFloat(amount) - net).toFixed(2) : 0;
  const withholding = orgKey !== 'IMENTOR_IKE';
  const withholdingAmt = withholding ? (net * 0.20).toFixed(2) : 0;

  const onSubmit = async data => {
    setLoading(true);
    try {
      const res = await api.post('/invoices/create', data);
      toast.success(`Τιμολόγιο εκδόθηκε: ${res.data.invoice_number}`);
      onDone();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Σφάλμα έκδοσης');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-1">
        <div><strong>Πελάτης:</strong> {record?.customer_name}</div>
        <div><strong>ΑΦΜ:</strong> {record?.vat_number || '—'}</div>
        <div><strong>Υπηρεσία:</strong> {record?.service_type}</div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Οργανισμός Έκδοσης</label>
          <select className="input" {...register('org_key')}>
            <option value="DEFAULT">i-Mentor (κύρια)</option>
            <option value="IMENTOR_IKE">I MENTOR IKE</option>
          </select>
        </div>
        <div>
          <label className="label">Ημερομηνία Τιμολογίου</label>
          <input type="date" className="input" {...register('date')} />
        </div>
        <div>
          <label className="label">Ποσό με ΦΠΑ (€)</label>
          <input type="number" step="0.01" className="input" {...register('amount', { required: true })} />
        </div>
      </div>

      <div>
        <label className="label">Περιγραφή / Αιτιολογία</label>
        <textarea className="input h-16" {...register('description')} />
      </div>

      {amount && (
        <div className="bg-blue-50 rounded-lg p-4 text-sm space-y-1">
          <div className="flex justify-between"><span>Καθαρό ποσό:</span><strong>{fmt(parseFloat(net))}</strong></div>
          <div className="flex justify-between"><span>ΦΠΑ 24%:</span><strong>{fmt(parseFloat(vat))}</strong></div>
          {withholding && <div className="flex justify-between text-red-600"><span>Παρακράτηση 20%:</span><strong>-{fmt(parseFloat(withholdingAmt))}</strong></div>}
          <div className="flex justify-between font-bold border-t pt-1"><span>Πληρωτέο:</span><span>{fmt(parseFloat(amount) - (withholding ? parseFloat(withholdingAmt) : 0))}</span></div>
        </div>
      )}

      <div className="flex justify-end gap-3">
        <button type="button" className="btn-secondary" onClick={onClose}>Ακύρωση</button>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Έκδοση...' : '🧾 Έκδοση Τιμολογίου'}
        </button>
      </div>
    </form>
  );
}

export default function InvoicesPage() {
  const [data, setData] = useState({ total: 0, data: [] });
  const [filters, setFilters] = useState({ year: new Date().getFullYear(), search: '', page: 1 });
  const [selected, setSelected] = useState(null);

  const load = useCallback(() => {
    const params = { ...filters, limit: 50 };
    api.get('/income', { params }).then(r => setData(r.data));
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const years = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i);
  const fmtD = d => d ? new Date(d).toLocaleDateString('el-GR') : '—';

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Τιμολόγια / Αποδείξεις</h1>
      <p className="text-gray-500 text-sm">Επιλέξτε εγγραφή εσόδου για να εκδώσετε τιμολόγιο μέσω Elorus.</p>

      <div className="card p-4">
        <div className="grid grid-cols-3 gap-3">
          <input className="input" placeholder="Αναζήτηση πελάτη…" value={filters.search}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value, page: 1 }))} />
          <select className="input" value={filters.year} onChange={e => setFilters(f => ({ ...f, year: e.target.value, page: 1 }))}>
            {years.map(y => <option key={y}>{y}</option>)}
          </select>
          <button className="btn-secondary" onClick={() => setFilters({ year: new Date().getFullYear(), search: '', page: 1 })}>Καθαρισμός</button>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Ημ/νία','Πελάτης','Υπηρεσία','Ποσό','Τιμολόγιο','Ενέργεια'].map(h => (
                  <th key={h} className="table-head table-cell">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.data.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="table-cell whitespace-nowrap">{fmtD(r.sale_date)}</td>
                  <td className="table-cell font-medium">{r.customer_name}</td>
                  <td className="table-cell text-xs">{r.service_type}</td>
                  <td className="table-cell font-semibold text-green-700">{fmt(r.amount_collected)}</td>
                  <td className="table-cell">
                    {r.invoice_number
                      ? <span className="badge bg-green-100 text-green-800">{r.invoice_number}</span>
                      : <span className="badge bg-gray-100 text-gray-500">Χωρίς τιμολόγιο</span>
                    }
                  </td>
                  <td className="table-cell">
                    <button className="btn-primary btn-sm" onClick={() => setSelected(r)}>
                      {r.invoice_number ? '🔄 Νέο' : '🧾 Έκδοση'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t flex items-center justify-between text-sm text-gray-500">
          <span>Σελίδα {filters.page} · {data.total} σύνολο</span>
          <div className="flex gap-2">
            <button disabled={filters.page <= 1} onClick={() => setFilters(f => ({ ...f, page: f.page-1 }))} className="btn-secondary btn-sm disabled:opacity-40">← Πρηγ.</button>
            <button disabled={filters.page * 50 >= data.total} onClick={() => setFilters(f => ({ ...f, page: f.page+1 }))} className="btn-secondary btn-sm disabled:opacity-40">Επόμ. →</button>
          </div>
        </div>
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)} title="Έκδοση Τιμολογίου / Απόδειξης" size="md">
        {selected && <InvoiceModal record={selected} onClose={() => setSelected(null)} onDone={() => { setSelected(null); load(); }} />}
      </Modal>
    </div>
  );
}
