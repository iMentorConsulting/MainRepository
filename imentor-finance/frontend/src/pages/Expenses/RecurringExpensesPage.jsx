import { useState, useEffect } from 'react';
import api from '../../api/client';
import toast from 'react-hot-toast';
import Modal from '../../components/Modal';

const EMPTY = { amount: '', category: '', supplier: '', description: '', vat_amount: '', payment_method: '', notes: '', is_active: true, day_of_month: 1 };

export default function RecurringExpensesPage() {
  const [rows, setRows] = useState([]);
  const [modal, setModal] = useState({ open: false, record: null });
  const [form, setForm] = useState(EMPTY);
  const [lists, setLists] = useState({});
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    load();
    // Load category and supplier lists
    Promise.all([
      api.get('/lists?list_type=ΚΑΤΗΓΟΡΙΕΣ_ΕΞΟΔΩΝ&active_only=true'),
      api.get('/lists?list_type=ΠΡΟΜΗΘΕΥΤΕΣ&active_only=true'),
    ]).then(([c, s]) => setLists({ categories: c.data.map(x => x.value), suppliers: s.data.map(x => x.value) }));
  }, []);

  const load = () => api.get('/recurring-expenses').then(r => setRows(r.data)).catch(() => {});

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const r = await api.post('/recurring-expenses/generate');
      toast.success(`Δημιουργήθηκαν ${r.data.generated} νέα έξοδα για ${r.data.month}${r.data.skipped > 0 ? ` (${r.data.skipped} παραλείφθηκαν — ήδη δημιουργήθηκαν)` : ''}`);
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Σφάλμα'); }
    finally { setGenerating(false); }
  };

  const handleSave = async () => {
    try {
      if (modal.record?.id) await api.put(`/recurring-expenses/${modal.record.id}`, form);
      else await api.post('/recurring-expenses', form);
      toast.success('Αποθηκεύτηκε');
      setModal({ open: false, record: null });
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Σφάλμα'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Διαγραφή;')) return;
    await api.delete(`/recurring-expenses/${id}`);
    load();
  };

  const fmt = n => n != null ? Number(n).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €' : '—';
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Επαναλαμβανόμενα Έξοδα</h1>
          <p className="page-sub">{rows.length} επαναλαμβανόμενες εγγραφές</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={handleGenerate} disabled={generating}>
            {generating ? 'Δημιουργία...' : '🔄 Δημιουργία Εξόδων Μήνα'}
          </button>
          <button className="btn-primary" onClick={() => { setForm(EMPTY); setModal({ open: true, record: null }); }}>
            + Νέο Επαναλαμβανόμενο
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="th">Κατηγορία</th>
              <th className="th">Προμηθευτής</th>
              <th className="th text-right">Ποσό</th>
              <th className="th text-center">Ημέρα</th>
              <th className="th">Τελευταία Γένεση</th>
              <th className="th text-center">Κατάσταση</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="tr">
                <td className="td">{r.category || '—'}</td>
                <td className="td font-medium">{r.supplier || '—'}</td>
                <td className="td text-right font-semibold">{fmt(r.amount)}</td>
                <td className="td text-center">{r.day_of_month || 1}</td>
                <td className="td text-slate-500">{r.last_generated_month || '—'}</td>
                <td className="td text-center">
                  <span className={r.is_active ? 'badge-green' : 'badge-gray'}>{r.is_active ? 'Ενεργό' : 'Ανενεργό'}</span>
                </td>
                <td className="td">
                  <div className="flex gap-1 justify-end">
                    <button className="btn-secondary text-xs py-1 px-2" onClick={() => { setForm({ ...r }); setModal({ open: true, record: r }); }}>✏️</button>
                    <button className="btn-secondary text-xs py-1 px-2 text-rose-600" onClick={() => handleDelete(r.id)}>🗑</button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="td text-center text-slate-400 py-8">Δεν υπάρχουν επαναλαμβανόμενα έξοδα</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modal.open} onClose={() => setModal({ open: false, record: null })} title={modal.record?.id ? 'Επεξεργασία Επαναλαμβανόμενου' : 'Νέο Επαναλαμβανόμενο Έξοδο'}>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Κατηγορία</label>
            <select className="input" value={form.category || ''} onChange={e => set('category', e.target.value)}>
              <option value="">— Επιλογή —</option>
              {(lists.categories || []).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Προμηθευτής</label>
            <select className="input" value={form.supplier || ''} onChange={e => set('supplier', e.target.value)}>
              <option value="">— Επιλογή —</option>
              {(lists.suppliers || []).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Ποσό (€) *</label>
            <input type="number" step="0.01" className="input" value={form.amount || ''} onChange={e => set('amount', e.target.value)} />
          </div>
          <div>
            <label className="label">ΦΠΑ (€)</label>
            <input type="number" step="0.01" className="input" value={form.vat_amount || ''} onChange={e => set('vat_amount', e.target.value)} />
          </div>
          <div>
            <label className="label">Ημέρα Μήνα (1-28)</label>
            <input type="number" min="1" max="28" className="input" value={form.day_of_month || 1} onChange={e => set('day_of_month', e.target.value)} />
          </div>
          <div>
            <label className="label">Τρόπος Πληρωμής</label>
            <input type="text" className="input" value={form.payment_method || ''} onChange={e => set('payment_method', e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="label">Περιγραφή</label>
            <input type="text" className="input" value={form.description || ''} onChange={e => set('description', e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="label">Σημειώσεις</label>
            <textarea className="input h-16 resize-none" value={form.notes || ''} onChange={e => set('notes', e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={!!form.is_active} onChange={e => set('is_active', e.target.checked)} className="w-4 h-4" />
              <span className="text-sm">Ενεργό</span>
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-slate-100">
          <button className="btn-secondary" onClick={() => setModal({ open: false, record: null })}>Ακύρωση</button>
          <button className="btn-primary" onClick={handleSave}>Αποθήκευση</button>
        </div>
      </Modal>
    </div>
  );
}
