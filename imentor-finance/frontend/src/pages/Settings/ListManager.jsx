import { useState, useEffect, useRef } from 'react';
import api from '../../api/client';
import toast from 'react-hot-toast';

function TwoFAPanel() {
  const [status, setStatus] = useState(null); // null=loading, true=enabled, false=disabled
  const [phase, setPhase] = useState('idle'); // 'idle' | 'setup' | 'disable'
  const [qr, setQr] = useState(null);
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const codeRef = useRef(null);

  const loadStatus = () =>
    api.get('/auth/2fa/status').then(r => setStatus(r.data.enabled)).catch(() => setStatus(false));

  useEffect(() => { loadStatus(); }, []);

  useEffect(() => {
    if ((phase === 'setup' || phase === 'disable') && codeRef.current) {
      setTimeout(() => codeRef.current?.focus(), 50);
    }
  }, [phase]);

  const startSetup = async () => {
    setLoading(true);
    try {
      const r = await api.get('/auth/2fa/setup');
      setQr(r.data.qr);
      setSecret(r.data.secret);
      setCode('');
      setPhase('setup');
    } catch { toast.error('Σφάλμα φόρτωσης QR'); } finally { setLoading(false); }
  };

  const activate = async () => {
    if (code.length < 6) return;
    setLoading(true);
    try {
      await api.post('/auth/2fa/activate', { secret, code });
      toast.success('2FA ενεργοποιήθηκε!');
      setPhase('idle');
      setQr(null);
      setSecret('');
      setCode('');
      loadStatus();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Λάθος κωδικός — σκανάρετε ξανά');
      setCode('');
      codeRef.current?.focus();
    } finally { setLoading(false); }
  };

  const disable = async () => {
    if (code.length < 6) return;
    setLoading(true);
    try {
      await api.delete('/auth/2fa', { data: { code } });
      toast.success('2FA απενεργοποιήθηκε');
      setPhase('idle');
      setCode('');
      loadStatus();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Λάθος κωδικός authenticator');
      setCode('');
      codeRef.current?.focus();
    } finally { setLoading(false); }
  };

  const cancel = () => { setPhase('idle'); setCode(''); setQr(null); setSecret(''); };

  return (
    <div className="card p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5 text-indigo-500">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 8.25h3m-3 4.5h1.5" />
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-slate-800">Έλεγχος Ταυτότητας 2 Βημάτων (2FA)</h3>
          <p className="text-xs text-slate-400">Google Authenticator — TOTP κωδικός κάθε 30 δευτερόλεπτα</p>
        </div>
        {status !== null && (
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${status ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
            {status ? '✓ Ενεργό' : 'Ανενεργό'}
          </span>
        )}
      </div>

      {phase === 'idle' && (
        <div className="flex gap-3">
          {status === false && (
            <button onClick={startSetup} disabled={loading}
              className="btn-primary flex items-center gap-2">
              {loading ? 'Φόρτωση…' : '+ Ενεργοποίηση 2FA'}
            </button>
          )}
          {status === true && (
            <button onClick={() => { setCode(''); setPhase('disable'); }}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 transition-colors">
              Απενεργοποίηση 2FA
            </button>
          )}
          {status === null && <span className="text-sm text-slate-400">Φόρτωση…</span>}
        </div>
      )}

      {phase === 'setup' && qr && (
        <div className="space-y-5">
          <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-100 text-sm text-indigo-800">
            <strong className="block mb-1">Βήμα 1</strong>
            Σκανάρετε το QR code με το <strong>Google Authenticator</strong> (ή οποιαδήποτε TOTP εφαρμογή).
          </div>
          <div className="flex flex-col sm:flex-row gap-6 items-start">
            <div className="p-3 bg-white rounded-2xl border border-slate-200 shadow-sm shrink-0">
              <img src={qr} alt="2FA QR" className="w-40 h-40" />
            </div>
            <div className="space-y-3 flex-1">
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Ή εισάγετε χειροκίνητα το secret key:</div>
                <code className="block bg-slate-100 px-3 py-2 rounded-xl text-xs font-mono text-slate-700 break-all select-all">
                  {secret}
                </code>
              </div>
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-100 text-sm text-amber-800">
                <strong className="block mb-0.5">Βήμα 2</strong>
                Μόλις σκανάρετε, εισάγετε τον <strong>6ψήφιο κωδικό</strong> που εμφανίζεται στην εφαρμογή για επαλήθευση.
              </div>
              <div className="flex gap-2">
                <input
                  ref={codeRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={e => e.key === 'Enter' && activate()}
                  className="input w-36 font-mono text-center text-xl tracking-widest"
                />
                <button onClick={activate} disabled={loading || code.length < 6}
                  className="btn-primary">
                  {loading ? 'Επαλήθευση…' : 'Ενεργοποίηση'}
                </button>
                <button onClick={cancel} className="btn-secondary">Ακύρωση</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {phase === 'disable' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-100 text-sm text-rose-800">
            Για να απενεργοποιήσετε το 2FA, εισάγετε τον <strong>τρέχοντα κωδικό</strong> από το Google Authenticator.
          </div>
          <div className="flex gap-2">
            <input
              ref={codeRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={e => e.key === 'Enter' && disable()}
              className="input w-36 font-mono text-center text-xl tracking-widest"
            />
            <button onClick={disable} disabled={loading || code.length < 6}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 transition-colors">
              {loading ? 'Απενεργοποίηση…' : 'Επιβεβαίωση'}
            </button>
            <button onClick={cancel} className="btn-secondary">Ακύρωση</button>
          </div>
        </div>
      )}
    </div>
  );
}

function BackupPanel() {
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [autoStatus, setAutoStatus] = useState(null);

  useEffect(() => {
    api.get('/backup/status').then(r => setAutoStatus(r.data)).catch(() => {});
  }, []);

  const fmtDate = iso => iso
    ? new Date(iso).toLocaleString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

  const handleDownload = () => {
    const base = api.defaults?.baseURL || '/api';
    const a = document.createElement('a');
    a.href = `${base}/backup/export`;
    a.click();
  };

  const handleDriveBackup = async () => {
    setRunning(true);
    try {
      const r = await api.post('/backup/run');
      setLastResult(r.data);
      const driveOk = !!r.data.driveFile;
      setAutoStatus({ ran_at: new Date().toISOString(), ok: driveOk, counts: r.data.counts, filename: r.data.filename, driveError: r.data.driveError || null, codeSnapshot: r.data.codeSnapshot || null, codeError: r.data.codeError || null });
      if (driveOk) {
        const codeInfo = r.data.codeSnapshot ? ` · Κώδικας: ${r.data.codeSnapshot.file_count} αρχεία` : '';
        toast.success(`Αποθηκεύτηκε στο Drive: ${r.data.driveFile.name}${codeInfo}`);
      } else {
        toast.error(`Drive upload απέτυχε: ${r.data.driveError || 'Άγνωστο σφάλμα'}`);
      }
    } catch (e) {
      toast.error(e.response?.data?.error || 'Σφάλμα backup');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="card p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-xl shrink-0">☁️</div>
        <div>
          <h3 className="font-bold text-slate-800">Backup Δεδομένων</h3>
          <p className="text-xs text-slate-400">Αυτόματο backup στο Google Drive κάθε μέρα στις <strong>18:00 Αθήνα</strong></p>
        </div>
      </div>

      {/* Automated backup status */}
      <div className={`mb-4 p-3 rounded-xl border text-xs flex items-center gap-3 ${
        autoStatus?.ran_at === null ? 'bg-slate-50 border-slate-200 text-slate-500' :
        autoStatus?.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
        'bg-rose-50 border-rose-200 text-rose-700'
      }`}>
        <span className="text-lg">
          {autoStatus?.ran_at === null ? '⏳' : autoStatus?.ok ? '✅' : '❌'}
        </span>
        <div>
          <div className="font-semibold">
            {autoStatus?.ran_at === null
              ? 'Δεν έχει τρέξει αυτόματο backup από την τελευταία εκκίνηση'
              : autoStatus?.ok
              ? `Τελευταίο αυτόματο backup: ${fmtDate(autoStatus.ran_at)}`
              : `Αποτυχία Drive upload: ${autoStatus?.driveError || autoStatus?.error || 'Άγνωστο σφάλμα'}`}
          </div>
          {autoStatus?.filename && <div className="opacity-75 mt-0.5">📦 {autoStatus.filename}</div>}
          {autoStatus?.codeSnapshot && <div className="opacity-75 mt-0.5">💻 {autoStatus.codeSnapshot.filename} ({autoStatus.codeSnapshot.file_count} αρχεία)</div>}
          {autoStatus?.codeError && <div className="text-amber-600 mt-0.5">⚠️ Κώδικας: {autoStatus.codeError}</div>}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button onClick={handleDownload} className="btn-secondary flex items-center gap-2">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M10 3a.75.75 0 0 1 .75.75v8.69l2.22-2.22a.75.75 0 1 1 1.06 1.06l-3.5 3.5a.75.75 0 0 1-1.06 0l-3.5-3.5a.75.75 0 1 1 1.06-1.06l2.22 2.22V3.75A.75.75 0 0 1 10 3ZM5.75 16a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5h-8.5Z" clipRule="evenodd"/>
          </svg>
          Λήψη JSON
        </button>
        <button onClick={handleDriveBackup} disabled={running} className="btn-primary flex items-center gap-2">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M9.25 13.25a.75.75 0 0 0 1.5 0V4.636l2.955 3.129a.75.75 0 0 0 1.09-1.03l-4.25-4.5a.75.75 0 0 0-1.09 0l-4.25 4.5a.75.75 0 1 0 1.09 1.03L9.25 4.636v8.614Z"/>
            <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z"/>
          </svg>
          {running ? 'Αποστολή…' : 'Backup τώρα → Drive'}
        </button>
      </div>
      {lastResult && (
        <div className="mt-4 p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-600">
          <div className="font-semibold mb-1 text-slate-700">Αποτέλεσμα</div>
          {lastResult.driveFile && <div className="text-emerald-600 font-medium mb-1">{lastResult.driveFile.name}</div>}
          <div className="grid grid-cols-3 gap-2 mt-1">
            {Object.entries(lastResult.counts || {}).map(([k, v]) => (
              <div key={k}><span className="text-slate-400">{k}:</span> <strong>{v}</strong></div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LogistisSyncPanel() {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  useEffect(() => {
    api.get('/logistis-sync/status').then(r => setLastResult(r.data)).catch(() => {});
  }, []);

  const fmtDate = iso => iso
    ? new Date(iso).toLocaleString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

  const handlePreview = async () => {
    setLoading(true);
    try {
      const r = await api.get('/logistis-sync/preview');
      setPreview(r.data);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Σφάλμα preview');
    } finally { setLoading(false); }
  };

  const handleSend = async () => {
    setSending(true);
    try {
      const r = await api.post('/logistis-sync/send', { date: preview?.date });
      setLastResult({ ran_at: new Date().toISOString(), ok: true, ...r.data });
      toast.success(`Στάλθηκαν ${r.data.sent} πληρωμές (${r.data.result?.matched ?? 0} αντιστοιχίστηκαν)`);
      setPreview(null);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Σφάλμα αποστολής');
    } finally { setSending(false); }
  };

  return (
    <div className="card p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-xl shrink-0">🧾</div>
        <div>
          <h3 className="font-bold text-slate-800">Αποστολή Πληρωμών στο Logistis</h3>
          <p className="text-xs text-slate-400">Αυτόματη αποστολή κάθε μέρα στις <strong>02:00 Αθήνα</strong> (πληρωμές της προηγούμενης ημέρας)</p>
        </div>
      </div>

      <div className={`mb-4 p-3 rounded-xl border text-xs flex items-center gap-3 ${
        !lastResult?.ran_at ? 'bg-slate-50 border-slate-200 text-slate-500' :
        lastResult?.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
        'bg-rose-50 border-rose-200 text-rose-700'
      }`}>
        <span className="text-lg">{!lastResult?.ran_at ? '⏳' : lastResult?.ok ? '✅' : '❌'}</span>
        <div>
          <div className="font-semibold">
            {!lastResult?.ran_at
              ? 'Δεν έχει τρέξει αποστολή από την τελευταία εκκίνηση'
              : lastResult?.ok
              ? `Τελευταία αποστολή: ${fmtDate(lastResult.ran_at)} — ${lastResult.sent ?? 0} πληρωμές`
              : `Αποτυχία: ${lastResult?.error || 'Άγνωστο σφάλμα'}`}
          </div>
          {lastResult?.result && (
            <div className="opacity-75 mt-0.5">
              {lastResult.result.matched ?? 0} αντιστοιχίστηκαν · {lastResult.result.unmatched ?? 0} χωρίς αντιστοίχιση
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button onClick={handlePreview} disabled={loading} className="btn-secondary flex items-center gap-2">
          {loading ? 'Φόρτωση…' : '🔍 Προεπισκόπηση (χθεσινές)'}
        </button>
        {preview && (
          <button onClick={handleSend} disabled={sending || preview.payments.length === 0} className="btn-primary flex items-center gap-2">
            {sending ? 'Αποστολή…' : `📤 Αποστολή ${preview.payments.length} πληρωμών`}
          </button>
        )}
      </div>

      {preview && (
        <div className="mt-4 p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-600">
          <div className="font-semibold mb-1 text-slate-700">Προεπισκόπηση για {preview.date}</div>
          {preview.payments.length === 0 && <div className="text-slate-400">Καμία πληρωμή για αποστολή</div>}
          {preview.payments.map(p => (
            <div key={p.externalId} className="flex items-center justify-between py-0.5 border-b border-slate-100 last:border-0">
              <span>{p.onomasia || p.afm} · {p.category}</span>
              <span className="font-semibold">{(p.amount / 100).toLocaleString('el-GR')} €</span>
            </div>
          ))}
          {preview.skipped?.length > 0 && (
            <div className="mt-2 text-amber-600">
              ⚠️ {preview.skipped.length} εγγραφές παραλείφθηκαν (λείπουν στοιχεία)
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const LIST_TYPES = [
  { key: 'ΚΑΤΗΓΟΡΙΕΣ_ΕΞΟΔΩΝ',       label: 'Κατηγορίες Εξόδων',       color: 'bg-orange-500' },
  { key: 'ΠΡΟΜΗΘΕΥΤΕΣ',              label: 'Προμηθευτές / Υπάλληλοι', color: 'bg-blue-500' },
  { key: 'ΚΑΤΑΣΤΑΣΗ_ΕΡΓΑΣΙΑΣ',       label: 'Κατάσταση Εργασίας',      color: 'bg-violet-500' },
  { key: 'ΕΙΔΟΣ_ΥΠΗΡΕΣΙΑΣ',         label: 'Είδος Υπηρεσίας',          color: 'bg-emerald-500' },
  { key: 'ΠΗΓΗ_ΣΥΣΤΑΣΗ',             label: 'Πηγή / Σύσταση',           color: 'bg-pink-500' },
  { key: 'ΠΡΑΚΤΟΡΕΣ',                label: 'Σύμβουλοι',                color: 'bg-amber-500' },
  { key: 'description_templates',    label: 'Αιτιολογίες Εσόδων',       color: 'bg-teal-500' },
];

export default function ListManager() {
  const [activeType, setActiveType] = useState(LIST_TYPES[0].key);
  const [items, setItems] = useState([]);
  const [newValue, setNewValue] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [seeding, setSeeding] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [editingId, setEditingId] = useState(null); // { id, value } — inline category edit

  const isServiceType = activeType === 'ΕΙΔΟΣ_ΥΠΗΡΕΣΙΑΣ';

  const load = () => api.get(`/lists?list_type=${activeType}`).then(r => setItems(r.data));
  useEffect(() => { load(); setEditingId(null); setNewCategory(''); }, [activeType]);

  const toggleActive = async item => {
    try { await api.put(`/lists/${item.id}`, { is_active: !item.is_active }); load(); }
    catch { toast.error('Σφάλμα'); }
  };

  const addSingle = async () => {
    if (!newValue.trim()) return;
    try {
      await api.post('/lists', {
        list_type: activeType,
        value: newValue.trim(),
        is_active: true,
        ...(isServiceType && newCategory.trim() ? { category: newCategory.trim() } : {}),
      });
      toast.success('Προστέθηκε!');
      setNewValue('');
      load();
    } catch { toast.error('Σφάλμα'); }
  };

  const addBulk = async () => {
    const lines = bulkText.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return toast.error('Δεν υπάρχουν στοιχεία');
    try {
      await Promise.all(lines.map(v =>
        api.post('/lists', { list_type: activeType, value: v, is_active: true })
      ));
      toast.success(`Προστέθηκαν ${lines.length} στοιχεία!`);
      setBulkText('');
      setShowBulk(false);
      load();
    } catch { toast.error('Σφάλμα μαζικής εισαγωγής'); }
  };

  const deleteItem = async id => {
    try { await api.delete(`/lists/${id}`); load(); }
    catch { toast.error('Σφάλμα διαγραφής'); }
  };

  const saveCategory = async () => {
    if (!editingId) return;
    try {
      await api.put(`/lists/${editingId.id}`, { category: editingId.value || null });
      setEditingId(null);
      load();
    } catch { toast.error('Σφάλμα αποθήκευσης κατηγορίας'); }
  };

  const seedDefaults = async () => {
    setSeeding(true);
    try {
      const r = await api.post('/lists/seed');
      toast.success(`Προστέθηκαν ${r.data.seeded} προεπιλεγμένα στοιχεία`);
      load();
    } catch { toast.error('Σφάλμα'); } finally { setSeeding(false); }
  };

  const active   = items.filter(i => i.is_active);
  const inactive = items.filter(i => !i.is_active);
  const activeTab = LIST_TYPES.find(t => t.key === activeType);

  // Existing categories (for datalist autocomplete)
  const existingCategories = [...new Set(items.filter(i => i.category).map(i => i.category))].sort();

  // Group active service types by category
  const categoryGroups = (() => {
    if (!isServiceType) return [];
    const groups = {};
    active.forEach(item => {
      const cat = item.category || '';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    });
    return Object.entries(groups).sort((a, b) => {
      if (!a[0] && b[0]) return 1;
      if (a[0] && !b[0]) return -1;
      return a[0].localeCompare(b[0], 'el');
    });
  })();

  const ItemRow = (item) => (
    <div key={item.id}
      className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-slate-50 group transition-colors">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="text-sm text-slate-700 truncate">{item.value}</span>
        {isServiceType && (
          editingId?.id === item.id ? (
            <>
              <input
                autoFocus
                list="cat-datalist"
                className="text-xs border border-slate-300 rounded-lg px-2 py-0.5 w-36 focus:outline-none focus:border-indigo-400"
                value={editingId.value}
                onChange={e => setEditingId(ei => ({ ...ei, value: e.target.value }))}
                onBlur={saveCategory}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveCategory();
                  if (e.key === 'Escape') setEditingId(null);
                }}
              />
              <datalist id="cat-datalist">
                {existingCategories.map(c => <option key={c} value={c} />)}
              </datalist>
            </>
          ) : (
            <span
              onClick={() => setEditingId({ id: item.id, value: item.category || '' })}
              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded cursor-pointer select-none shrink-0
                ${item.category
                  ? 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                  : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>
              {item.category || '+ κατηγορία'}
            </span>
          )
        )}
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2">
        <button onClick={() => toggleActive(item)}
          className="px-2 py-1 rounded-lg text-xs font-medium bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors">
          Απενεργ.
        </button>
        <button onClick={() => deleteItem(item.id)}
          className="px-2 py-1 rounded-lg text-xs font-medium bg-rose-50 text-rose-500 hover:bg-rose-100 transition-colors">
          ✕
        </button>
      </div>
    </div>
  );

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Λίστες & Ρυθμίσεις</h1>
          <p className="page-sub">Διαχείριση dropdown επιλογών</p>
        </div>
        <button onClick={seedDefaults} disabled={seeding} className="btn-secondary">
          {seeding ? 'Φόρτωση...' : '↺ Φόρτωση Προεπιλεγμένων'}
        </button>
      </div>

      {/* Type tabs */}
      <div className="flex gap-2 flex-wrap">
        {LIST_TYPES.map(t => (
          <button key={t.key} onClick={() => setActiveType(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-150
              ${activeType === t.key
                ? 'bg-primary-600 text-white shadow-sm'
                : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300 shadow-card'
              }`}>
            <span className={`w-2 h-2 rounded-full ${t.color}`} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Info banner for service type grouping */}
      {isServiceType && (
        <div className="rounded-xl px-4 py-3 bg-indigo-50 border border-indigo-100 text-sm text-indigo-700 flex items-start gap-3">
          <span className="text-lg shrink-0">📂</span>
          <div>
            <strong>Ομαδοποίηση Υπηρεσιών:</strong> Κάντε κλικ στη μικρή ετικέτα κατηγορίας δίπλα σε κάθε υπηρεσία για να την αναθέσετε ή αλλάξετε κατηγορία.
            Τα reports & cards ομαδοποιούν αυτόματα βάσει της κατηγορίας.
          </div>
        </div>
      )}

      {/* Add new */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-800">
            Προσθήκη σε: <span className="text-primary-600">{activeTab?.label}</span>
            <span className="ml-2 text-slate-400 font-normal text-sm">({active.length} ενεργά)</span>
          </h3>
          <button onClick={() => setShowBulk(v => !v)}
            className={`btn-sm ${showBulk ? 'btn-primary' : 'btn-secondary'}`}>
            {showBulk ? '✕ Κλείσιμο' : '⊞ Μαζική Εισαγωγή'}
          </button>
        </div>

        {/* Single add */}
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="Νέο στοιχείο…"
            value={newValue}
            onChange={e => setNewValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addSingle()}
          />
          {isServiceType && (
            <>
              <input
                list="cat-datalist-add"
                className="input w-44"
                placeholder="Κατηγορία…"
                value={newCategory}
                onChange={e => setNewCategory(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addSingle()}
              />
              <datalist id="cat-datalist-add">
                {existingCategories.map(c => <option key={c} value={c} />)}
              </datalist>
            </>
          )}
          <button className="btn-primary" onClick={addSingle}>+ Προσθήκη</button>
        </div>

        {/* Bulk add */}
        {showBulk && (
          <div className="space-y-3 animate-slide-up">
            <div className="p-3 rounded-xl bg-primary-50 border border-primary-100 text-xs text-primary-700">
              Επικολλήστε πολλά στοιχεία, <strong>ένα ανά γραμμή</strong>.
            </div>
            <textarea
              className="input h-40 font-mono text-xs resize-none"
              placeholder={"ΣΤΟΙΧΕΙΟ 1\nΣΤΟΙΧΕΙΟ 2\nΣΤΟΙΧΕΙΟ 3\n..."}
              value={bulkText}
              onChange={e => setBulkText(e.target.value)}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">
                {bulkText.split('\n').filter(l => l.trim()).length} στοιχεία έτοιμα
              </span>
              <button className="btn-primary" onClick={addBulk}>⊕ Εισαγωγή Όλων</button>
            </div>
          </div>
        )}
      </div>

      {/* Active / Inactive split */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Active */}
        <div className="card p-5">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            Ενεργά
            <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{active.length}</span>
          </h3>
          <div className="space-y-0.5 max-h-[560px] overflow-y-auto -mx-1 px-1">
            {isServiceType ? (
              categoryGroups.map(([cat, catItems]) => (
                <div key={cat || '__none__'}>
                  <div className="flex items-center gap-2 px-2 pt-3 pb-1 sticky top-0 bg-white z-10">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${cat ? 'text-indigo-600' : 'text-slate-400'}`}>
                      {cat || 'Χωρίς κατηγορία'}
                    </span>
                    <span className="text-[10px] text-slate-300">({catItems.length})</span>
                    <div className="flex-1 h-px bg-slate-100" />
                  </div>
                  {catItems.map(item => ItemRow(item))}
                </div>
              ))
            ) : (
              active.map(item => ItemRow(item))
            )}
            {active.length === 0 && (
              <div className="text-slate-400 text-sm text-center py-8">Δεν υπάρχουν ενεργά στοιχεία</div>
            )}
          </div>
        </div>

        {/* Inactive */}
        <div className="card p-5">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-slate-300 inline-block" />
            Ανενεργά
            <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{inactive.length}</span>
          </h3>
          <p className="text-xs text-slate-400 mb-3 bg-slate-50 rounded-lg p-2">
            Δεν εμφανίζονται στα dropdowns νέων εγγραφών.
          </p>
          <div className="space-y-0.5 max-h-[440px] overflow-y-auto -mx-1 px-1">
            {inactive.map(item => (
              <div key={item.id}
                className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-slate-50 group transition-colors">
                <span className="text-sm text-slate-400">{item.value}</span>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => toggleActive(item)}
                    className="px-2 py-1 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors">
                    Ενεργοπ.
                  </button>
                  <button onClick={() => deleteItem(item.id)}
                    className="px-2 py-1 rounded-lg text-xs font-medium bg-rose-50 text-rose-500 hover:bg-rose-100 transition-colors">
                    ✕
                  </button>
                </div>
              </div>
            ))}
            {inactive.length === 0 && (
              <div className="text-slate-400 text-sm text-center py-8">Δεν υπάρχουν ανενεργά</div>
            )}
          </div>
        </div>
      </div>

      <TwoFAPanel />
      <BackupPanel />
      <LogistisSyncPanel />
    </div>
  );
}
