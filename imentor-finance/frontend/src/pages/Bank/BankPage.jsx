import { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/client';

const fmt = n => Number(n).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

const INVOICE_OPTIONS = [
  { v: '', label: '—' },
  { v: '1', label: '✓ Εκδόθηκε' },
  { v: '0', label: '✗ Όχι' },
];

function NoteInput({ tx, onSave }) {
  const [val, setVal] = useState(tx.note || '');
  useEffect(() => setVal(tx.note || ''), [tx.note]);
  return (
    <input className="input w-full min-w-[130px]" placeholder="Σημείωση…" value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={() => val !== (tx.note || '') && onSave({ note: val })} />
  );
}

function CategoryInput({ tx, onSave, options }) {
  const [val, setVal] = useState(tx.category || '');
  useEffect(() => setVal(tx.category || ''), [tx.category]);
  return (
    <input className="input w-full min-w-[130px]" placeholder="Κατηγορία" list="bank-categories" value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={() => val !== (tx.category || '') && onSave({ category: val })} />
  );
}

function InvoiceSelect({ tx, onSave }) {
  const v = tx.invoice_issued === null || tx.invoice_issued === undefined ? '' : tx.invoice_issued ? '1' : '0';
  return (
    <select className="input w-full min-w-[140px]" value={v}
      onChange={e => onSave({ invoice_issued: e.target.value === '' ? null : e.target.value === '1' })}>
      {INVOICE_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
    </select>
  );
}

const STATUS = {
  active:  { label: 'Ενεργή',    cls: 'badge-green'  },
  expired: { label: 'Έληξε',     cls: 'badge-red'    },
  pending: { label: 'Σε εξέλιξη', cls: 'badge-yellow' },
  error:   { label: 'Σφάλμα',    cls: 'badge-red'    },
  none:    { label: 'Μη συνδεδεμένη', cls: 'badge-gray' },
};
const daysLeft = d => d ? Math.ceil((new Date(d) - Date.now()) / 86400000) : null;
const fmtDateTime = d => d ? new Date(d).toLocaleString('el-GR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

function ConnectionsPanel({ info, onConnect, busy }) {
  if (!info) return null;
  const expiring = info.connections.filter(c => c.status === 'expired' || (c.status === 'active' && daysLeft(c.consent_expires_at) <= 7));
  return (
    <div className="card p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-600">Αυτόματη σύνδεση τραπεζών</span>
        {info.provider === 'mock' && <span className="badge-orange">ΔΟΚΙΜΑΣΤΙΚΟ ΠΕΡΙΒΑΛΛΟΝ (mock)</span>}
        {!info.configured && <span className="badge-gray">Αναμένεται ρύθμιση παρόχου</span>}
      </div>

      {expiring.length > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm px-3 py-2">
          {expiring.map(c => (
            <div key={c.bank}>
              <b>{c.label}</b>: {c.status === 'expired' ? 'η συγκατάθεση έχει λήξει' : `η συγκατάθεση λήγει σε ${daysLeft(c.consent_expires_at)} ημέρες`} — πατήστε «Ανανέωση σύνδεσης».
            </div>
          ))}
        </div>
      )}

      {!info.configured && (
        <p className="text-xs text-slate-400">
          Η σύνδεση θα ενεργοποιηθεί όταν προστεθούν τα στοιχεία πρόσβασης του παρόχου στο Railway (NBG_BASE_URL, NBG_CLIENT_ID, NBG_CLIENT_SECRET). Μέχρι τότε η εισαγωγή αρχείου λειτουργεί κανονικά.
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {info.connections.map(c => {
          const st = STATUS[c.status] || STATUS.none;
          const left = daysLeft(c.consent_expires_at);
          return (
            <div key={c.bank} className="rounded-xl border border-slate-200 p-3 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-700 text-sm">{c.label}</span>
                <span className={st.cls}>{st.label}</span>
              </div>
              <div className="text-xs text-slate-400">
                {c.status === 'active' && <>Λήξη σε {left} ημέρες<br /></>}
                Τελευταίος έλεγχος: {fmtDateTime(c.last_sync_at)}
              </div>
              {c.last_error && c.status !== 'active' && <div className="text-xs text-rose-600 break-words">{c.last_error}</div>}
              <button className="btn btn-secondary btn-sm w-full" disabled={busy || !info.configured} onClick={() => onConnect(c.bank)}>
                {c.status === 'none' ? 'Σύνδεση' : 'Ανανέωση σύνδεσης'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function BankPage() {
  const [direction, setDirection] = useState('credit');
  const [bank, setBank] = useState('');
  const [onlyNew, setOnlyNew] = useState(false);
  const [noInvoice, setNoInvoice] = useState(false);
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({ new_credits: 0, new_debits: 0, credits_without_invoice: 0 });
  const [banks, setBanks] = useState({});
  const [loading, setLoading] = useState(true);
  const [importBank, setImportBank] = useState('alpha');
  const [uploading, setUploading] = useState(false);
  const [connInfo, setConnInfo] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const params = { direction, limit: 500 };
      if (bank) params.bank = bank;
      if (onlyNew) params.unseen = 1;
      if (noInvoice && direction === 'credit') params.no_invoice = 1;
      if (q) params.q = q;
      const [list, sum] = await Promise.all([api.get('/bank/transactions', { params }), api.get('/bank/summary')]);
      setRows(list.data);
      setSummary(sum.data);
    } catch {
      toast.error('Αποτυχία φόρτωσης κινήσεων');
    } finally {
      setLoading(false);
    }
  }, [direction, bank, onlyNew, noInvoice, q]);

  useEffect(() => { api.get('/bank/banks').then(r => setBanks(r.data)).catch(() => {}); }, []);
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);
  useEffect(() => { const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

  // live refresh when the server announces new movements (PaymentNotifier shows the toast)
  useEffect(() => {
    const token = localStorage.getItem('finance_token');
    if (!token) return;
    const es = new EventSource(`/api/notifications/stream?token=${encodeURIComponent(token)}`);
    es.addEventListener('new_bank_transactions', load);
    es.onerror = () => {};
    return () => es.close();
  }, [load]);

  const save = async (tx, patch) => {
    try {
      const { data } = await api.patch(`/bank/transactions/${tx.id}`, patch);
      setRows(rs => rs.map(r => r.id === tx.id ? { ...r, ...data } : r));
      if ('invoice_issued' in patch || 'seen' in patch) api.get('/bank/summary').then(s => setSummary(s.data));
    } catch {
      toast.error('Αποτυχία αποθήκευσης');
    }
  };
  // typing a note counts as having seen the row
  const saveSeen = (tx, patch) => save(tx, tx.seen ? patch : { ...patch, seen: true });


  const loadConnections = useCallback(() => {
    api.get('/bank/connections').then(r => setConnInfo(r.data)).catch(() => {});
  }, []);
  useEffect(() => { loadConnections(); }, [loadConnections]);

  // the bank sends the browser back to /bank?bank_connected=... or ?bank_error=...
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    if (qs.get('bank_connected')) toast.success('Η τράπεζα συνδέθηκε. Γίνεται η πρώτη ανάκτηση κινήσεων…');
    if (qs.get('bank_error')) toast.error(qs.get('bank_error'), { duration: 8000 });
    if (qs.has('bank_connected') || qs.has('bank_error')) {
      window.history.replaceState({}, '', '/bank');
      setTimeout(() => { loadConnections(); load(); }, 2500);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const connectBank = async bank => {
    try {
      const { data } = await api.post('/bank/connections', { bank });
      window.location.href = data.redirect_url;     // the bank's own login/consent page
    } catch (e) {
      toast.error(e.response?.data?.error || 'Αποτυχία έναρξης σύνδεσης');
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      const { data } = await api.post('/bank/sync');
      if (data.skipped) toast('Ο έλεγχος ήδη εκτελείται, δοκιμάστε σε λίγο.');
      else if (!data.results.length) toast('Δεν υπάρχει ενεργή σύνδεση τράπεζας. Συνδέστε μια τράπεζα ή εισάγετε αρχείο.');
      else {
        const added = data.results.reduce((n, r) => n + (r.new || 0), 0);
        const failed = data.results.filter(r => !r.ok);
        if (added) toast.success(`Νέες κινήσεις: ${added}`); else if (!failed.length) toast('Καμία νέα κίνηση.');
        failed.forEach(r => toast.error(`${r.bank}: ${r.error}`));
      }
      load(); loadConnections();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Αποτυχία ανανέωσης');
    } finally { setSyncing(false); }
  };

  const markAllSeen = async () => {
    await api.post('/bank/mark-seen', { direction });
    load();
  };

  const upload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return toast.error('Επιλέξτε αρχείο κίνησης λογαριασμού');
    const fd = new FormData();
    fd.append('bank', importBank);
    fd.append('file', file);
    setUploading(true);
    try {
      const { data } = await api.post('/bank/import', fd);
      toast.success(`Νέες: ${data.new} · Διπλές: ${data.duplicates} · Ειδοποιήσεις: ${data.notified}`);
      if (data.notify_error) toast.error(`Σφάλμα Viber: ${data.notify_error}`);
      if (fileRef.current) fileRef.current.value = '';
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Αποτυχία εισαγωγής');
    } finally {
      setUploading(false);
    }
  };

  const categories = [...new Set(rows.map(r => r.category).filter(Boolean))];
  const isCredit = direction === 'credit';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-slate-800 mr-2">Τράπεζες</h1>
        <span className="badge-yellow">Νέες πιστώσεις: {summary.new_credits}</span>
        <span className="badge-orange">Πιστώσεις χωρίς τιμολόγιο: {summary.credits_without_invoice}</span>
        <button className="btn btn-primary btn-sm ml-auto" onClick={syncNow} disabled={syncing}>
          {syncing ? 'Ανανέωση…' : '↻ Ανανέωση τώρα'}
        </button>
      </div>

      <ConnectionsPanel info={connInfo} onConnect={connectBank} busy={syncing} />

      {/* Import */}
      <div className="card p-4 flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold text-slate-600">Εισαγωγή κίνησης λογαριασμού</span>
        <select className="input !w-auto" value={importBank} onChange={e => setImportBank(e.target.value)}>
          {Object.entries(banks).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input ref={fileRef} type="file" accept=".csv,.txt,.sta,.mt940,.940,.tsv" className="text-sm max-w-full" />
        <button className="btn btn-primary btn-sm" onClick={upload} disabled={uploading}>
          {uploading ? 'Εισαγωγή…' : 'Εισαγωγή'}
        </button>
        <span className="text-xs text-slate-400">CSV ή MT940 από το e-banking. Οι διπλές κινήσεις αγνοούνται αυτόματα.</span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl border border-slate-200 overflow-hidden">
          {[['credit', 'Πιστώσεις'], ['debit', 'Χρεώσεις']].map(([d, l]) => (
            <button key={d} onClick={() => setDirection(d)}
              className={`px-4 py-2 text-sm font-semibold ${direction === d ? 'bg-primary-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
              {l}
            </button>
          ))}
        </div>
        <select className="input !w-auto" value={bank} onChange={e => setBank(e.target.value)}>
          <option value="">Όλες οι τράπεζες</option>
          {Object.entries(banks).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className={`btn btn-sm ${onlyNew ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setOnlyNew(v => !v)}>Μόνο νέες</button>
        {isCredit && (
          <button className={`btn btn-sm ${noInvoice ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setNoInvoice(v => !v)}>Χωρίς τιμολόγιο</button>
        )}
        <input className="input !w-auto flex-1 min-w-[160px]" type="search" placeholder="Αναζήτηση…" value={q} onChange={e => setQ(e.target.value)} />
        <button className="btn btn-secondary btn-sm" onClick={markAllSeen}>Όλες ως διαβασμένες</button>
      </div>

      <datalist id="bank-categories">{categories.map(c => <option key={c} value={c} />)}</datalist>

      {loading ? (
        <div className="card p-10 text-center text-slate-400">Φόρτωση…</div>
      ) : rows.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">Καμία κίνηση.</div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="card overflow-hidden hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">Ημ/νία</th><th className="th">Τράπεζα</th><th className="th text-right">Ποσό</th>
                    <th className="th">Αντισυμβαλλόμενος / Περιγραφή</th><th className="th">Κατηγορία</th>
                    {isCredit && <th className="th">Τιμολόγιο</th>}<th className="th">Σημείωση</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(tx => (
                    <tr key={tx.id} className={tx.seen ? '' : 'bg-amber-50/60'}
                      onClick={e => { if (!tx.seen && e.target.tagName === 'TD') save(tx, { seen: true }); }}>
                      <td className="td whitespace-nowrap">{fmtDate(tx.tx_date)}</td>
                      <td className="td whitespace-nowrap">{banks[tx.bank] || tx.bank}</td>
                      <td className={`td text-right whitespace-nowrap font-semibold tabular-nums ${isCredit ? 'text-emerald-600' : 'text-rose-600'}`}>{fmt(tx.amount)}</td>
                      <td className="td">
                        <div>{tx.counterparty || tx.description}</div>
                        {tx.counterparty && tx.description && <div className="text-xs text-slate-400">{tx.description}</div>}
                      </td>
                      <td className="td"><CategoryInput tx={tx} onSave={p => saveSeen(tx, p)} /></td>
                      {isCredit && <td className="td"><InvoiceSelect tx={tx} onSave={p => saveSeen(tx, p)} /></td>}
                      <td className="td"><NoteInput tx={tx} onSave={p => saveSeen(tx, p)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {rows.map(tx => (
              <div key={tx.id} className={`card p-4 space-y-2.5 ${tx.seen ? '' : 'ring-2 ring-amber-300'}`}
                onClick={e => { if (!tx.seen && !['INPUT', 'SELECT'].includes(e.target.tagName)) save(tx, { seen: true }); }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-slate-400">{fmtDate(tx.tx_date)} · {banks[tx.bank] || tx.bank}</div>
                    <div className="font-medium text-slate-800 break-words">{tx.counterparty || tx.description}</div>
                    {tx.counterparty && tx.description && <div className="text-xs text-slate-400 break-words">{tx.description}</div>}
                  </div>
                  <div className={`font-bold whitespace-nowrap tabular-nums ${isCredit ? 'text-emerald-600' : 'text-rose-600'}`}>{fmt(tx.amount)}</div>
                </div>
                <CategoryInput tx={tx} onSave={p => saveSeen(tx, p)} />
                {isCredit && <InvoiceSelect tx={tx} onSave={p => saveSeen(tx, p)} />}
                <NoteInput tx={tx} onSave={p => saveSeen(tx, p)} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
