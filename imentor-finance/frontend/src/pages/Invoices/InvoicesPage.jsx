import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import api from '../../api/client';
import Modal from '../../components/Modal';
import toast from 'react-hot-toast';

const fmt = n => n ? Number(n).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €' : '—';
const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

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
  const payable = parseFloat(amount || 0) - (withholding ? parseFloat(withholdingAmt) : 0);

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
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="rounded-xl p-4 space-y-1.5 text-sm" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.08))', border: '1px solid rgba(99,102,241,0.15)' }}>
        <div className="flex justify-between">
          <span className="text-slate-500">Πελάτης</span>
          <span className="font-semibold text-slate-800">{record?.customer_name}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">ΑΦΜ</span>
          <span className="text-slate-700">{record?.vat_number || '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Υπηρεσία</span>
          <span className="text-slate-700 text-right max-w-[60%]">{record?.service_type || '—'}</span>
        </div>
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
          <label className="label">Ποσό με ΦΠΑ (€) <span className="text-rose-500">*</span></label>
          <input type="number" step="0.01" className="input" {...register('amount', { required: true })} />
        </div>
      </div>

      <div>
        <label className="label">Περιγραφή / Αιτιολογία</label>
        <textarea className="input h-16 resize-none" {...register('description')} />
      </div>

      {amount && parseFloat(amount) > 0 && (
        <div className="rounded-xl p-4 space-y-2 text-sm" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
          <div className="flex justify-between text-slate-600">
            <span>Καθαρό ποσό</span>
            <span className="font-semibold">{fmt(parseFloat(net))}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>ΦΠΑ 24%</span>
            <span className="font-semibold">{fmt(parseFloat(vat))}</span>
          </div>
          {withholding && (
            <div className="flex justify-between text-rose-600">
              <span>Παρακράτηση 20%</span>
              <span className="font-semibold">−{fmt(parseFloat(withholdingAmt))}</span>
            </div>
          )}
          <div className="flex justify-between font-black text-slate-800 border-t border-emerald-200 pt-2 mt-1">
            <span>Πληρωτέο</span>
            <span className="text-emerald-700">{fmt(payable)}</span>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
        <button type="button" className="btn-secondary" onClick={onClose}>Ακύρωση</button>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Έκδοση...' : 'Έκδοση Τιμολογίου'}
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

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Τιμολόγια</h1>
          <p className="page-sub">Έκδοση τιμολογίων μέσω Elorus</p>
        </div>
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
          {years.map(y => <option key={y}>{y}</option>)}
        </select>
        <button className="btn-ghost btn-sm" onClick={() => setFilters({ year: new Date().getFullYear(), search: '', page: 1 })}>
          ✕ Καθαρισμός
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {['Ημερομηνία','Πελάτης','Υπηρεσία','Ποσό','Τιμολόγιο',''].map(h => (
                  <th key={h} className="th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.data.map(r => (
                <tr key={r.id} className="tr">
                  <td className="td whitespace-nowrap text-slate-500 text-xs">{fmtDate(r.sale_date)}</td>
                  <td className="td">
                    <div className="font-semibold text-slate-800 max-w-[180px] truncate">{r.customer_name}</div>
                    {r.accountant && <div className="text-xs text-slate-400 mt-0.5">{r.accountant}</div>}
                  </td>
                  <td className="td max-w-[160px]">
                    <div className="text-xs text-slate-600 truncate">{r.service_type || '—'}</div>
                  </td>
                  <td className="td font-bold text-emerald-600 whitespace-nowrap">{fmt(r.amount_collected)}</td>
                  <td className="td">
                    {r.invoice_number
                      ? <span className="badge-blue">{r.invoice_number}</span>
                      : <span className="text-xs text-slate-300">Χωρίς τιμολόγιο</span>
                    }
                  </td>
                  <td className="td">
                    <button className="btn-primary btn-sm" onClick={() => setSelected(r)}>
                      {r.invoice_number ? 'Νέο' : 'Έκδοση'}
                    </button>
                  </td>
                </tr>
              ))}
              {data.data.length === 0 && (
                <tr><td colSpan={6} className="td text-center text-slate-400 py-12">
                  <div className="text-3xl mb-2">🧾</div>
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

      <Modal open={!!selected} onClose={() => setSelected(null)} title="Έκδοση Τιμολογίου" size="md">
        {selected && <InvoiceModal record={selected} onClose={() => setSelected(null)} onDone={() => { setSelected(null); load(); }} />}
      </Modal>
    </div>
  );
}
