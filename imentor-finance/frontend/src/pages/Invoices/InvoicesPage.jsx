import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import Modal from '../../components/Modal';
import toast from 'react-hot-toast';

const fmt = n => n ? Number(n).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €' : '—';
const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

const ORG_LABEL = { DEFAULT: 'i-Mentor (κύρια)', IMENTOR_IKE: 'I MENTOR IKE' };

function calcAmounts(amountWithVat, orgKey, kind, vatRate = 24) {
  const gross = parseFloat(amountWithVat) || 0;
  const net = gross / (1 + vatRate / 100);
  const vat = gross - net;
  const hasWH = kind !== 'APY' && orgKey !== 'IMENTOR_IKE' && net > 301;
  const wh = hasWH ? net * 0.20 : 0;
  const payable = gross - wh;
  return { gross, net, vat, wh, payable };
}

function AmountBreakdown({ amount, orgKey, kind, vatRate = 24 }) {
  if (!amount || parseFloat(amount) <= 0) return null;
  const { net, vat, wh, payable } = calcAmounts(amount, orgKey, kind, vatRate);
  return (
    <div className="rounded-xl p-4 space-y-2 text-sm" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
      <div className="flex justify-between text-slate-600"><span>Καθαρό</span><span className="font-semibold">{fmt(net)}</span></div>
      <div className="flex justify-between text-slate-600"><span>ΦΠΑ {vatRate}%</span><span className="font-semibold">{fmt(vat)}</span></div>
      {wh > 0 && <div className="flex justify-between text-rose-600"><span>Παρακράτηση 20%</span><span className="font-semibold">−{fmt(wh)}</span></div>}
      <div className="flex justify-between font-black text-slate-800 border-t border-emerald-200 pt-2"><span>Πληρωτέο</span><span className="text-emerald-700">{fmt(payable)}</span></div>
    </div>
  );
}

function InvoiceModal({ record, onClose, onDone }) {
  const today = new Date().toISOString().split('T')[0];
  // State detection
  const hasDraft   = !!record.elorus_invoice_id && !record.invoice_number;
  const hasInvoice = !!record.invoice_number;
  // When a draft or invoice exists, use the org that created it — no need to ask again
  const lockedOrg  = record.elorus_org_key || null;

  const [orgKey, setOrgKey]           = useState(lockedOrg || 'DEFAULT');
  const [kind, setKind]               = useState('TPY');
  const [amount, setAmount]           = useState(String(record.amount_collected || ''));
  const [description, setDescription] = useState(record.description || record.service_type || '');
  const [date, setDate]               = useState(today);
  const [payAmount, setPayAmount]     = useState('');
  const [payDate, setPayDate]         = useState(today);
  const [loading, setLoading]         = useState(null);
  const [reducedVat, setReducedVat]   = useState(false);

  const vatRate = reducedVat ? 17 : 24;

  // Pre-fill payable when amount changes
  useEffect(() => {
    if (amount) {
      const effectiveOrg = (hasDraft || hasInvoice) ? (lockedOrg || orgKey) : orgKey;
      const { payable } = calcAmounts(amount, effectiveOrg, kind, vatRate);
      setPayAmount(payable.toFixed(2));
    }
  }, [amount, orgKey, kind, vatRate]);

  const effectiveOrg = (hasDraft || hasInvoice) ? (lockedOrg || orgKey) : orgKey;

  const call = async (action, extra = {}) => {
    setLoading(action);
    try {
      return (await api.post(`/invoices/${action}`, { income_id: record.id, org_key: effectiveOrg, ...extra })).data;
    } finally { setLoading(null); }
  };

  const handleDraft = async () => {
    try {
      await call('create-draft', { amount, description, date, kind, reduced_vat: reducedVat });
      toast.success('Draft δημιουργήθηκε στο Elorus');
      onDone();
    } catch (e) { toast.error(e.response?.data?.error || 'Σφάλμα'); }
  };

  const handleOneShot = async () => {
    try {
      const r = await call('one-shot', { amount, description, date, kind, reduced_vat: reducedVat });
      toast.success(`Τιμολόγιο ${r.invoice_number} — εκδόθηκε, εστάλη & πληρώθηκε`);
      onDone();
    } catch (e) { toast.error(e.response?.data?.error || 'Σφάλμα'); }
  };

  const handleFinalize = async () => {
    try {
      const r = await call('finalize-and-send');
      toast.success(`Εκδόθηκε: ${r.invoice_number}`);
      onDone();
    } catch (e) { toast.error(e.response?.data?.error || 'Σφάλμα'); }
  };

  const handlePayment = async () => {
    if (!payAmount || parseFloat(payAmount) <= 0) return toast.error('Εισάγετε ποσό πληρωμής');
    try {
      await call('record-payment', { amount: payAmount, date: payDate });
      toast.success('Πληρωμή καταχωρήθηκε στο Elorus');
      onDone();
    } catch (e) { toast.error(e.response?.data?.error || 'Σφάλμα'); }
  };

  // Customer info box — always shown
  const infoBox = (
    <div className="rounded-xl p-4 space-y-1.5 text-sm" style={{ background: 'linear-gradient(135deg,rgba(99,102,241,.08),rgba(139,92,246,.08))', border: '1px solid rgba(99,102,241,.15)' }}>
      <div className="flex justify-between"><span className="text-slate-500">Πελάτης</span><span className="font-bold text-slate-800">{record.customer_name}</span></div>
      <div className="flex justify-between"><span className="text-slate-500">ΑΦΜ</span><span className="text-slate-700">{record.vat_number || '—'}</span></div>
      <div className="flex justify-between"><span className="text-slate-500">Υπηρεσία</span><span className="text-slate-700 text-right max-w-[60%]">{record.service_type || '—'}</span></div>
    </div>
  );

  // ── MODE: Draft exists — org is locked, choose finalize or payment ──
  if (hasDraft) {
    return (
      <div className="space-y-5">
        {infoBox}
        <div className="rounded-xl px-4 py-3 flex items-center gap-3 bg-amber-50 border border-amber-200 text-sm">
          <span className="text-xl">📄</span>
          <div>
            <div className="font-bold text-amber-800">Draft υπάρχει στο Elorus</div>
            <div className="text-amber-600 text-xs">Οργανισμός: <strong>{ORG_LABEL[lockedOrg] || lockedOrg || '—'}</strong> · ID: {record.elorus_invoice_id}</div>
          </div>
        </div>
        <div className="space-y-3">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Πληρωμή για καταχώρηση</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Ποσό Πληρωμής (€)</label>
              <input type="number" step="0.01" className="input" value={payAmount} onChange={e => setPayAmount(e.target.value)} />
            </div>
            <div>
              <label className="label">Ημερομηνία</label>
              <input type="date" className="input" value={payDate} onChange={e => setPayDate(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <button className="btn-secondary" onClick={onClose}>Ακύρωση</button>
          <button className="btn-secondary" disabled={loading === 'record-payment'} onClick={handlePayment}>
            {loading === 'record-payment' ? 'Καταχώρηση…' : '💳 Καταχώρηση Πληρωμής'}
          </button>
          <button className="btn-primary" disabled={loading === 'finalize-and-send'} onClick={handleFinalize}>
            {loading === 'finalize-and-send' ? 'Έκδοση…' : '✅ Οριστική Έκδοση + Αποστολή'}
          </button>
        </div>
      </div>
    );
  }

  // ── MODE: Invoice exists — org is locked, only payment ──
  if (hasInvoice) {
    return (
      <div className="space-y-5">
        {infoBox}
        <div className="rounded-xl px-4 py-3 flex items-center gap-3 bg-emerald-50 border border-emerald-200 text-sm">
          <span className="text-xl">🧾</span>
          <div>
            <div className="font-bold text-emerald-800">{record.invoice_number}</div>
            <div className="text-emerald-600 text-xs">Οργανισμός: <strong>{ORG_LABEL[lockedOrg] || lockedOrg || '—'}</strong></div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Ποσό Πληρωμής (€)</label>
            <input type="number" step="0.01" className="input" value={payAmount} onChange={e => setPayAmount(e.target.value)} />
          </div>
          <div>
            <label className="label">Ημερομηνία</label>
            <input type="date" className="input" value={payDate} onChange={e => setPayDate(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <button className="btn-secondary" onClick={onClose}>Ακύρωση</button>
          <button className="btn-primary" disabled={loading === 'record-payment'} onClick={handlePayment}>
            {loading === 'record-payment' ? 'Καταχώρηση…' : '💳 Καταχώρηση Πληρωμής'}
          </button>
        </div>
      </div>
    );
  }

  // ── MODE: No draft, no invoice — full creation form ──
  return (
    <div className="space-y-5">
      {infoBox}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Οργανισμός Έκδοσης</label>
          <select className="input" value={orgKey} onChange={e => setOrgKey(e.target.value)}>
            <option value="DEFAULT">i-Mentor (κύρια)</option>
            <option value="IMENTOR_IKE">I MENTOR IKE</option>
          </select>
        </div>
        <div>
          <label className="label">Τύπος</label>
          <select className="input" value={kind} onChange={e => setKind(e.target.value)}>
            <option value="TPY">ΤΠΥ — Τιμολόγιο Παροχής Υπηρεσιών</option>
            <option value="APY">ΑΠΥ — Απόδειξη Παροχής Υπηρεσιών</option>
          </select>
        </div>
        <div>
          <label className="label">Ποσό με ΦΠΑ (€) <span className="text-rose-500">*</span></label>
          <input type="number" step="0.01" className="input" value={amount} onChange={e => setAmount(e.target.value)} />
        </div>
        <div>
          <label className="label">Ημερομηνία</label>
          <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="label">Περιγραφή / Αιτιολογία</label>
        <textarea className="input h-16 resize-none" value={description} onChange={e => setDescription(e.target.value)} />
      </div>
      <label className="flex items-center gap-2 text-sm cursor-pointer select-none w-fit">
        <input type="checkbox" checked={reducedVat} onChange={e => setReducedVat(e.target.checked)}
          className="w-4 h-4 rounded accent-sky-600 cursor-pointer" />
        <span className="text-slate-600">Μειωμένος ΦΠΑ <strong>17%</strong> <span className="text-slate-400">(νησιά)</span></span>
      </label>
      <AmountBreakdown amount={amount} orgKey={orgKey} kind={kind} vatRate={vatRate} />
      <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
        <button className="btn-secondary" onClick={onClose}>Ακύρωση</button>
        <button className="btn-secondary" disabled={!amount || loading === 'create-draft'} onClick={handleDraft}>
          {loading === 'create-draft' ? 'Δημιουργία…' : '📝 Δημιουργία Draft'}
        </button>
        <button className="btn-primary" disabled={!amount || !!loading} onClick={handleOneShot}>
          {loading === 'one-shot' ? 'Επεξεργασία…' : '⚡ Έκδοση + Αποστολή + Πληρωμή'}
        </button>
      </div>
    </div>
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
                      : r.elorus_invoice_id
                        ? <span className="badge-yellow text-xs">Draft · {ORG_LABEL[r.elorus_org_key] || r.elorus_org_key || '—'}</span>
                        : <span className="text-xs text-slate-300">Χωρίς τιμολόγιο</span>
                    }
                  </td>
                  <td className="td">
                    <button className="btn-primary btn-sm" onClick={() => setSelected(r)}>
                      {r.invoice_number ? 'Πληρωμή' : r.elorus_invoice_id ? 'Συνέχεια →' : 'Έκδοση'}
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
