import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import toast from 'react-hot-toast';
import Modal from '../../components/Modal';

const fmt = n => n ? Number(n).toLocaleString('el-GR', { minimumFractionDigits: 0 }) + ' €' : '—';
const fmtDate = d => d ? new Date(d).toLocaleDateString('el-GR') : '—';

export default function EmailsPage() {
  const [data, setData] = useState({ total: 0, data: [] });
  const [selected, setSelected] = useState(new Set());
  const [filters, setFilters] = useState({ year: new Date().getFullYear(), notified_only: false, page: 1 });
  const [preview, setPreview] = useState([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(() => {
    api.get('/income', { params: { year: filters.year, limit: 100, page: filters.page } }).then(r => setData(r.data));
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const toggle = id => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => {
    if (selected.size === data.data.length) setSelected(new Set());
    else setSelected(new Set(data.data.map(r => r.id)));
  };

  const handlePreview = async () => {
    if (selected.size === 0) return toast.error('Επιλέξτε εγγραφές');
    const res = await api.post('/emails/preview', { income_ids: [...selected] });
    setPreview(res.data);
    setPreviewOpen(true);
  };

  const handleSend = async () => {
    setSending(true);
    try {
      const res = await api.post('/emails/send', { income_ids: [...selected] });
      const sent = res.data.results.filter(r => r.status === 'sent').length;
      const skipped = res.data.results.filter(r => r.status === 'skipped').length;
      toast.success(`Εστάλησαν ${sent} email${skipped > 0 ? ` · Παραλείφθηκαν ${skipped} (χωρίς email)` : ''}`);
      setPreviewOpen(false);
      setSelected(new Set());
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Σφάλμα αποστολής');
    } finally {
      setSending(false);
    }
  };

  const years = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ενημέρωση Λογιστών</h1>
          <p className="text-sm text-gray-500 mt-0.5">Επιλέξτε εγγραφές και στείλτε email ενημέρωσης στους λογιστές.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={handlePreview} disabled={selected.size === 0}>
            👁 Προεπισκόπηση ({selected.size})
          </button>
          <button className="btn-primary" onClick={handleSend} disabled={selected.size === 0 || sending}>
            {sending ? 'Αποστολή...' : `📧 Αποστολή (${selected.size})`}
          </button>
        </div>
      </div>

      <div className="card p-4">
        <div className="grid grid-cols-3 gap-3">
          <select className="input" value={filters.year} onChange={e => setFilters(f => ({ ...f, year: e.target.value, page: 1 }))}>
            {years.map(y => <option key={y}>{y}</option>)}
          </select>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="notNotified" checked={filters.notified_only}
              onChange={e => setFilters(f => ({ ...f, notified_only: e.target.checked }))} className="w-4 h-4" />
            <label htmlFor="notNotified" className="text-sm">Μόνο μη ενημερωμένοι</label>
          </div>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="table-head table-cell w-10">
                  <input type="checkbox" checked={selected.size === data.data.length && data.data.length > 0}
                    onChange={toggleAll} className="w-4 h-4" />
                </th>
                {['Ημ/νία','Πελάτης','Υπηρεσία','Ποσό','Λογιστής','Τιμολόγιο','Ενημέρωση'].map(h => (
                  <th key={h} className="table-head table-cell">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.data.map(r => (
                <tr key={r.id} className={`hover:bg-gray-50 ${selected.has(r.id) ? 'bg-blue-50' : ''}`}>
                  <td className="table-cell">
                    <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="w-4 h-4" />
                  </td>
                  <td className="table-cell whitespace-nowrap text-sm">{fmtDate(r.sale_date)}</td>
                  <td className="table-cell font-medium max-w-[160px]"><div className="truncate">{r.customer_name}</div></td>
                  <td className="table-cell text-xs max-w-[140px]"><div className="truncate">{r.service_type}</div></td>
                  <td className="table-cell font-semibold text-green-700">{fmt(r.amount_collected)}</td>
                  <td className="table-cell text-sm">{r.accountant || '—'}</td>
                  <td className="table-cell text-xs">{r.invoice_number || '—'}</td>
                  <td className="table-cell">
                    {r.accountant_notified
                      ? <span className="badge bg-green-100 text-green-800">✓ {fmtDate(r.accountant_notified_at)}</span>
                      : <span className="badge bg-gray-100 text-gray-500">Όχι</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title="Προεπισκόπηση Email" size="xl">
        <div className="space-y-4">
          {preview.map((email, i) => (
            <div key={i} className="border rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 flex justify-between text-sm">
                <div><strong>Προς:</strong> {email.accountant} &lt;{email.email || 'χωρίς email'}&gt;</div>
                <div className="text-gray-500">{email.subject}</div>
              </div>
              <div className="p-4 max-h-64 overflow-y-auto" dangerouslySetInnerHTML={{ __html: email.html }} />
            </div>
          ))}
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => setPreviewOpen(false)}>Ακύρωση</button>
            <button className="btn-primary" onClick={handleSend} disabled={sending}>
              {sending ? 'Αποστολή...' : '📧 Αποστολή'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
