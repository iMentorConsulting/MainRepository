import { useState, useEffect, useRef } from 'react';
import api from '../api/client';
import Modal from './Modal';
import toast from 'react-hot-toast';

const ORGS = [
  { key: 'DEFAULT', label: 'ΑΠΟΣΤΟΛΑΚΗΣ' },
  { key: 'IMENTOR_IKE', label: 'I MENTOR IKE (χωρίς παρακράτηση)' },
];

function fmtE(n) {
  return Number(n).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function Breakdown({ amount, orgKey, kind }) {
  if (!amount || isNaN(parseFloat(amount))) return null;
  const net = parseFloat(amount);
  const vat = net * 0.24;
  const gross = net * 1.24;
  const wh = (kind !== 'APY' && orgKey !== 'IMENTOR_IKE' && net > 301) ? net * 0.20 : 0;
  return (
    <div className="rounded-xl p-3 text-xs space-y-1.5 bg-slate-50 border border-slate-100">
      <div className="flex justify-between text-slate-500"><span>Καθαρό</span><span className="font-medium text-slate-700">{fmtE(net)}</span></div>
      <div className="flex justify-between text-slate-500"><span>ΦΠΑ 24%</span><span className="font-medium text-slate-700">{fmtE(vat)}</span></div>
      <div className="flex justify-between font-semibold text-slate-600"><span>Σύνολο</span><span>{fmtE(gross)}</span></div>
      {wh > 0 && <div className="flex justify-between text-rose-500"><span>Παρακράτηση 20%</span><span className="font-medium">−{fmtE(wh)}</span></div>}
      {wh > 0 && (
        <div className="flex justify-between font-bold border-t border-slate-200 pt-1.5 text-slate-800">
          <span>Καθαρή Είσπραξη</span><span className="text-emerald-700">{fmtE(net - wh)}</span>
        </div>
      )}
    </div>
  );
}

function InvoiceForm({ action, record, onClose, onDone }) {
  const isOneShot = action === 'one-shot';
  const [orgKey, setOrgKey] = useState('DEFAULT');
  const [kind, setKind] = useState('TPY');
  const [amount, setAmount] = useState(String(record.amount_collected || ''));
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState(record.description || record.service_type || '');
  const [loading, setLoading] = useState(false);
  const [docTypes, setDocTypes] = useState([]);

  useEffect(() => {
    api.get(`/invoices/document-types?org_key=${orgKey}`)
      .then(r => setDocTypes(r.data || []))
      .catch(() => setDocTypes([]));
  }, [orgKey]);

  const isApy = kind === 'APY';

  const nextNumber = (k) => {
    const titleKey = k === 'APY' ? 'απόδειξη' : 'τιμολόγιο';
    const dt = docTypes.find(d => (d.title || '').toLowerCase().includes(titleKey));
    return dt?.next_number ?? null;
  };

  const submit = async () => {
    if (!amount) return toast.error('Εισάγετε ποσό');
    setLoading(true);
    try {
      const endpoint = isOneShot ? '/invoices/one-shot' : '/invoices/create-draft';
      const r = await api.post(endpoint, {
        income_id: record.id, org_key: orgKey,
        amount: parseFloat(amount), description, date,
        kind,
      });
      toast.success(r.data.invoice_number ? `✅ ${r.data.invoice_number}` : '📄 Draft δημιουργήθηκε');
      onDone();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Σφάλμα');
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-3 space-y-1.5 text-sm bg-indigo-50/60 border border-indigo-100">
        <div className="flex justify-between"><span className="text-slate-500">Πελάτης</span><span className="font-semibold text-slate-800 text-right max-w-[60%] truncate">{record.customer_name}</span></div>
        {record.vat_number && <div className="flex justify-between"><span className="text-slate-500">ΑΦΜ</span><span className="text-slate-700">{record.vat_number}</span></div>}
        {record.service_type && <div className="flex justify-between"><span className="text-slate-500">Υπηρεσία</span><span className="text-xs text-slate-600 text-right max-w-[60%] truncate">{record.service_type}</span></div>}
      </div>
      <div>
        <label className="label">Οργανισμός</label>
        <select className="input" value={orgKey} onChange={e => setOrgKey(e.target.value)}>
          {ORGS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Τύπος Παραστατικού *</label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { k: 'TPY', label: 'ΤΠΥ', sub: 'Τιμολόγιο Παροχής Υπηρεσιών' },
            { k: 'APY', label: 'ΑΠΥ', sub: 'Απόδειξη Παροχής Υπηρεσιών' },
          ].map(({ k, label, sub }) => {
            const nn = nextNumber(k);
            return (
              <button key={k} type="button"
                onClick={() => setKind(k)}
                className={`py-2.5 px-3 rounded-xl text-sm font-bold border transition-all text-left leading-tight
                  ${kind === k ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}>
                {label}<br/>
                <span className="text-xs font-normal opacity-75">{sub}</span>
                {nn != null && (
                  <span className={`block text-xs mt-1 font-semibold ${kind === k ? 'text-indigo-200' : 'text-indigo-500'}`}>
                    Επόμενο: #{nn}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Καθαρό Ποσό (€) *</label>
          <input type="number" step="0.01" className="input" value={amount} onChange={e => setAmount(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="label">Ημερομηνία</label>
          <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="label">Περιγραφή</label>
        <textarea className="input h-14 resize-none" value={description} onChange={e => setDescription(e.target.value)} />
      </div>
      <Breakdown amount={amount} orgKey={orgKey} kind={kind} />
      {isOneShot && (
        <div className="rounded-xl p-3 bg-emerald-50 border border-emerald-100 text-xs text-emerald-700">
          💳 Η πληρωμή καταχωρείται αυτόματα στο Elorus για το παραπάνω ποσό.
        </div>
      )}
      <div className="flex justify-end gap-3 border-t border-slate-100 pt-3">
        <button className="btn-secondary" onClick={onClose}>Ακύρωση</button>
        <button className="btn-primary" onClick={submit} disabled={loading}>
          {loading ? 'Επεξεργασία...' : isOneShot ? '🚀 Εκτέλεση' : '📄 Δημιουργία Draft'}
        </button>
      </div>
    </div>
  );
}

function PaymentForm({ record, onClose, onDone }) {
  const [orgKey, setOrgKey] = useState('DEFAULT');
  const [amount, setAmount] = useState(String(record.amount_collected || ''));
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!amount) return toast.error('Εισάγετε ποσό');
    setLoading(true);
    try {
      await api.post('/invoices/record-payment', {
        income_id: record.id, org_key: orgKey,
        amount: parseFloat(amount), date,
      });
      toast.success('💳 Πληρωμή καταχωρήθηκε');
      onDone();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Σφάλμα');
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-3 text-sm bg-indigo-50/60 border border-indigo-100 space-y-1.5">
        <div className="flex justify-between"><span className="text-slate-500">Πελάτης</span><span className="font-semibold text-slate-800">{record.customer_name}</span></div>
        {record.invoice_number && <div className="flex justify-between"><span className="text-slate-500">Τιμολόγιο</span><span className="badge-blue text-xs">{record.invoice_number}</span></div>}
      </div>
      <div>
        <label className="label">Οργανισμός</label>
        <select className="input" value={orgKey} onChange={e => setOrgKey(e.target.value)}>
          {ORGS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Ποσό (€)</label>
          <input type="number" step="0.01" className="input" value={amount} onChange={e => setAmount(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="label">Ημερομηνία</label>
          <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end gap-3 border-t border-slate-100 pt-3">
        <button className="btn-secondary" onClick={onClose}>Ακύρωση</button>
        <button className="btn-primary" onClick={submit} disabled={loading}>{loading ? 'Καταχώριση...' : '💳 Καταχώριση'}</button>
      </div>
    </div>
  );
}

function AfmResult({ record, onClose }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/invoices/search-afm?income_id=${record.id}`)
      .then(r => setResult(r.data))
      .catch(e => setResult({ error: e.response?.data?.error || e.message }))
      .finally(() => setLoading(false));
  }, [record.id]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-3 text-sm bg-slate-50 border border-slate-100 space-y-1">
        <div className="flex justify-between"><span className="text-slate-500">Πελάτης</span><span className="font-semibold text-slate-800">{record.customer_name}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">ΑΦΜ</span><span className="text-slate-700">{record.vat_number || '—'}</span></div>
      </div>
      {loading && <div className="text-center py-6 text-slate-400 text-sm">Αναζήτηση στο ΑΑΔΕ…</div>}
      {!loading && result?.error && (
        <div className="rounded-xl p-3 bg-rose-50 border border-rose-100 text-sm text-rose-700">{result.error}</div>
      )}
      {!loading && result && !result.error && (
        <div className="rounded-xl p-4 bg-emerald-50 border border-emerald-100 space-y-2 text-sm">
          <div className="font-bold text-emerald-800 text-base">{result.name}</div>
          {result.activity && <div className="text-xs text-emerald-600">Δραστηριότητα: {result.activity}</div>}
          {result.legal_status && <div className="text-xs text-emerald-600">Μορφή: {result.legal_status}</div>}
          {result.address && <div className="text-xs text-emerald-700">📍 {result.address}, {result.city} {result.postal_code}</div>}
        </div>
      )}
      <div className="flex justify-end pt-2 border-t border-slate-100">
        <button className="btn-secondary" onClick={onClose}>Κλείσιμο</button>
      </div>
    </div>
  );
}

export default function ElorusActionsButton({ record, onRefresh }) {
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState(null);
  const [finalizeOrgKey, setFinalizeOrgKey] = useState('DEFAULT');
  const [sendSelfOrgKey, setSendSelfOrgKey] = useState('DEFAULT');
  const [actionLoading, setActionLoading] = useState(false);
  const ref = useRef();

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const hasDraft = !!record.elorus_invoice_id && !record.invoice_number;
  const hasInvoice = !!record.invoice_number;

  const trigger = m => { setOpen(false); setModal(m); };

  const runAction = async (endpoint, orgKey) => {
    setActionLoading(true);
    try {
      const r = await api.post(endpoint, { income_id: record.id, org_key: orgKey });
      toast.success(r.data.invoice_number ? `✅ ${r.data.invoice_number}` : r.data.sent_to ? `📧 Εστάλη στο ${r.data.sent_to}` : '✅ Επιτυχία');
      setModal(null);
      onRefresh();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Σφάλμα');
    } finally { setActionLoading(false); }
  };

  let btnCls, btnTxt;
  if (hasInvoice) { btnCls = 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'; btnTxt = '✓ Τιμ.'; }
  else if (hasDraft) { btnCls = 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'; btnTxt = '⊡ Draft'; }
  else { btnCls = 'bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100'; btnTxt = 'Elorus'; }

  const Item = ({ icon, label, onClick, disabled, hi }) => (
    <button onClick={onClick} disabled={disabled}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors
        ${disabled ? 'opacity-35 cursor-not-allowed text-slate-400' : hi ? 'text-indigo-700 font-semibold hover:bg-indigo-50' : 'text-slate-700 hover:bg-slate-50'}`}>
      <span className="text-base leading-none w-5 shrink-0">{icon}</span>
      <span>{label}</span>
    </button>
  );

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(v => !v)}
        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all whitespace-nowrap ${btnCls}`}>
        {btnTxt}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-72 rounded-2xl shadow-2xl border border-slate-200/80 bg-white z-50 overflow-hidden animate-scale-in">
          <div className="px-3 pt-3 pb-2 border-b border-slate-100">
            <div className="text-xs font-bold text-slate-700 truncate">{record.customer_name}</div>
            {hasInvoice && <div className="text-xs text-emerald-600 font-medium mt-0.5">{record.invoice_number}</div>}
            {hasDraft && <div className="text-xs text-amber-600 font-medium mt-0.5">Draft ID: {record.elorus_invoice_id}</div>}
          </div>
          <div className="py-1">
            <Item icon="🔍" label="Αναζήτηση ΑΦΜ (τρέχουσα γραμμή)" onClick={() => trigger('afm')} />
            <div className="border-t border-slate-100 my-1" />
            <div className="px-3 pt-1 pb-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Elorus</div>
            <Item icon="📄" label="Δημιουργία ΤΠΥ/ΑΠΥ (draft) από γραμμή" onClick={() => trigger('draft')} />
            <Item icon="📧" label="Αποστολή draft (ΜΟΝΟ σε εμένα)" onClick={() => trigger('send-self')} disabled={!hasDraft} />
            <div className="border-t border-slate-100 my-1" />
            <Item icon="✅" label="Οριστική έκδοση & αποστολή (από No)" onClick={() => trigger('finalize')} disabled={!hasDraft} />
            <Item icon="🚀" label="Έκδοση + Αποστολή + Πληρωμή (one-shot)" onClick={() => trigger('oneshot')} hi />
            <Item icon="💳" label="Καταχώριση Πληρωμής..." onClick={() => trigger('payment')} disabled={!hasInvoice && !hasDraft} />
          </div>
        </div>
      )}

      <Modal open={modal === 'afm'} onClose={() => setModal(null)} title="Αναζήτηση ΑΦΜ" size="sm">
        <AfmResult record={record} onClose={() => setModal(null)} />
      </Modal>

      <Modal open={modal === 'draft' || modal === 'oneshot'} onClose={() => setModal(null)}
        title={modal === 'oneshot' ? '🚀 Έκδοση + Αποστολή + Πληρωμή' : 'Δημιουργία ΤΠΥ/ΑΠΥ (Draft)'} size="md">
        {(modal === 'draft' || modal === 'oneshot') && (
          <InvoiceForm action={modal === 'oneshot' ? 'one-shot' : 'create-draft'} record={record}
            onClose={() => setModal(null)} onDone={() => { setModal(null); onRefresh(); }} />
        )}
      </Modal>

      <Modal open={modal === 'payment'} onClose={() => setModal(null)} title="Καταχώριση Πληρωμής" size="sm">
        {modal === 'payment' && (
          <PaymentForm record={record} onClose={() => setModal(null)} onDone={() => { setModal(null); onRefresh(); }} />
        )}
      </Modal>

      <Modal open={modal === 'send-self'} onClose={() => setModal(null)} title="Αποστολή Draft σε εμένα" size="sm">
        <div className="space-y-4">
          <p className="text-slate-600 text-sm">Αποστολή του draft τιμολογίου στο email διαχειριστή για έλεγχο.</p>
          <div>
            <label className="label">Οργανισμός</label>
            <select className="input" value={sendSelfOrgKey} onChange={e => setSendSelfOrgKey(e.target.value)}>
              {ORGS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-3 border-t border-slate-100 pt-3">
            <button className="btn-secondary" onClick={() => setModal(null)}>Ακύρωση</button>
            <button className="btn-primary" onClick={() => runAction('/invoices/send-to-self', sendSelfOrgKey)} disabled={actionLoading}>
              {actionLoading ? 'Αποστολή...' : '📧 Αποστολή'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={modal === 'finalize'} onClose={() => setModal(null)} title="Οριστική Έκδοση & Αποστολή" size="sm">
        <div className="space-y-4">
          <p className="text-slate-600 text-sm">Οριστικοποίηση του draft και αποστολή.</p>
          <div>
            <label className="label">Οργανισμός</label>
            <select className="input" value={finalizeOrgKey} onChange={e => setFinalizeOrgKey(e.target.value)}>
              {ORGS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>
          {(record.email || record.accountant_email) ? (
            <div className="rounded-xl p-3 bg-slate-50 border border-slate-100 text-xs space-y-1">
              {record.email && <div className="flex gap-2"><span className="text-slate-400 w-16">Πελάτης:</span><span className="font-medium">{record.email}</span></div>}
              {record.accountant_email && <div className="flex gap-2"><span className="text-slate-400 w-16">Λογιστής:</span><span className="font-medium">{record.accountant_email}</span></div>}
            </div>
          ) : (
            <div className="rounded-xl p-3 bg-amber-50 border border-amber-100 text-xs text-amber-700">
              ⚠️ Δεν υπάρχει email. Το τιμολόγιο θα οριστικοποιηθεί χωρίς αποστολή.
            </div>
          )}
          <div className="flex justify-end gap-3 border-t border-slate-100 pt-3">
            <button className="btn-secondary" onClick={() => setModal(null)}>Ακύρωση</button>
            <button className="btn-primary" onClick={() => runAction('/invoices/finalize-and-send', finalizeOrgKey)} disabled={actionLoading}>
              {actionLoading ? 'Επεξεργασία...' : '✅ Οριστικοποίηση'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
