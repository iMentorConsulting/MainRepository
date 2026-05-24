import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import toast from 'react-hot-toast';
import Modal from '../../components/Modal';

const fmt = n => n ? Number(n).toLocaleString('el-GR', { minimumFractionDigits: 0 }) + ' €' : '—';
const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

export default function EmailsPage() {
  const [data, setData] = useState({ total: 0, data: [] });
  const [selected, setSelected] = useState(new Set());
  const [filters, setFilters] = useState({ year: new Date().getFullYear(), page: 1 });
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
      toast.success(`Εστάλησαν ${sent} email${skipped > 0 ? ` · Παραλείφθηκαν ${skipped}` : ''}`);
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
  const allSelected = selected.size === data.data.length && data.data.length > 0;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Ενημέρωση Λογιστών</h1>
          <p className="page-sub">Αποστολή email ενημέρωσης για νέες πληρωμές</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={handlePreview} disabled={selected.size === 0}>
            Προεπισκόπηση
            {selected.size > 0 && <span className="ml-1.5 bg-slate-200 text-slate-700 text-xs rounded-full px-1.5 py-0.5">{selected.size}</span>}
          </button>
          <button className="btn-primary" onClick={handleSend} disabled={selected.size === 0 || sending}>
            {sending ? 'Αποστολή...' : 'Αποστολή Email'}
            {selected.size > 0 && !sending && <span className="ml-1.5 bg-white/20 text-white text-xs rounded-full px-1.5 py-0.5">{selected.size}</span>}
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <select className="input w-28" value={filters.year} onChange={e => setFilters(f => ({ ...f, year: e.target.value, page: 1 }))}>
          {years.map(y => <option key={y}>{y}</option>)}
        </select>
        {selected.size > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 text-sm font-medium">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd"/></svg>
            {selected.size} επιλεγμένες
          </div>
        )}
        <button className="btn-ghost btn-sm ml-auto" onClick={() => setSelected(new Set())}>
          Αποεπιλογή
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th w-10">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll}
                    className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 cursor-pointer" />
                </th>
                {['Ημερομηνία','Πελάτης','Υπηρεσία','Ποσό','Λογιστής','Τιμολόγιο','Ενημέρωση'].map(h => (
                  <th key={h} className="th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.data.map(r => (
                <tr key={r.id} className={`tr cursor-pointer ${selected.has(r.id) ? 'bg-indigo-50/50' : ''}`}
                  onClick={() => toggle(r.id)}>
                  <td className="td" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)}
                      className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 cursor-pointer" />
                  </td>
                  <td className="td whitespace-nowrap text-slate-500 text-xs">{fmtDate(r.sale_date)}</td>
                  <td className="td">
                    <div className="font-semibold text-slate-800 max-w-[160px] truncate">{r.customer_name}</div>
                  </td>
                  <td className="td max-w-[140px]">
                    <div className="text-xs text-slate-500 truncate">{r.service_type || '—'}</div>
                  </td>
                  <td className="td font-bold text-emerald-600 whitespace-nowrap">{fmt(r.amount_collected)}</td>
                  <td className="td text-sm text-slate-600">{r.accountant || <span className="text-slate-300">—</span>}</td>
                  <td className="td">
                    {r.invoice_number
                      ? <span className="badge-blue text-xs">{r.invoice_number}</span>
                      : <span className="text-slate-300 text-xs">—</span>}
                  </td>
                  <td className="td">
                    {r.accountant_notified
                      ? <span className="badge-green">✓ {fmtDate(r.accountant_notified_at)}</span>
                      : <span className="badge-gray">Όχι</span>}
                  </td>
                </tr>
              ))}
              {data.data.length === 0 && (
                <tr><td colSpan={8} className="td text-center text-slate-400 py-12">
                  <div className="text-3xl mb-2">📧</div>
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
            <button disabled={filters.page * 100 >= data.total} onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}
              className="btn-secondary btn-sm disabled:opacity-40">Επόμ. →</button>
          </div>
        </div>
      </div>

      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title="Προεπισκόπηση Email" size="xl">
        <div className="space-y-4">
          {preview.map((email, i) => (
            <div key={i} className="rounded-xl overflow-hidden border border-slate-200">
              <div className="px-4 py-3 flex items-center justify-between text-sm bg-slate-50 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="badge-blue">{email.accountant}</span>
                  <span className="text-slate-500">{email.email || 'χωρίς email'}</span>
                </div>
                <span className="text-xs text-slate-400">{email.subject}</span>
              </div>
              <div className="p-4 max-h-64 overflow-y-auto bg-white" dangerouslySetInnerHTML={{ __html: email.html }} />
            </div>
          ))}
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button className="btn-secondary" onClick={() => setPreviewOpen(false)}>Ακύρωση</button>
            <button className="btn-primary" onClick={handleSend} disabled={sending}>
              {sending ? 'Αποστολή...' : 'Αποστολή'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
