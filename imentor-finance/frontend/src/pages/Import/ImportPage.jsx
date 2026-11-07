import { useState, useRef } from 'react';
import api from '../../api/client';
import toast from 'react-hot-toast';

function SyncSection() {
  const [syncing, setSyncing] = useState({ customers: false, agreements: false });
  const [syncResults, setSyncResults] = useState({});

  const syncCustomers = async () => {
    setSyncing(s => ({ ...s, customers: true }));
    try {
      const r = await api.post('/import/sync-customers');
      setSyncResults(prev => ({ ...prev, customers: r.data }));
      toast.success(`Πελάτες: ${r.data.created} νέοι, ${r.data.updated} υπάρχοντες`);
    } catch (e) { toast.error(e.response?.data?.error || 'Σφάλμα'); }
    finally { setSyncing(s => ({ ...s, customers: false })); }
  };

  const syncAgreements = async () => {
    setSyncing(s => ({ ...s, agreements: true }));
    try {
      const r = await api.post('/import/sync-agreements');
      setSyncResults(prev => ({ ...prev, agreements: r.data }));
      toast.success(`Συμφωνίες: ${r.data.created} νέες, ${r.data.skipped} υπάρχουσες`);
    } catch (e) { toast.error(e.response?.data?.error || 'Σφάλμα'); }
    finally { setSyncing(s => ({ ...s, agreements: false })); }
  };

  return (
    <div className="card p-6 border-2 border-dashed border-amber-200 bg-amber-50/30">
      <h2 className="section-title mb-1">Συγχρονισμός Δεδομένων (Εφάπαξ)</h2>
      <p className="text-xs text-slate-500 mb-4">Δημιουργεί Πελάτες και Συμφωνίες Υπηρεσιών από τις υπάρχουσες εγγραφές ΕΣΟΔΑ. Εκτελέστε μία φορά μετά την εισαγωγή CSV.</p>
      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <button className="btn-secondary" onClick={syncCustomers} disabled={syncing.customers}>
            {syncing.customers ? 'Επεξεργασία...' : '👥 Δημιουργία Πελατών από ΕΣΟΔΑ'}
          </button>
          {syncResults.customers && (
            <span className="text-xs text-slate-500">{syncResults.customers.created} νέοι · {syncResults.customers.updated} υπάρχοντες · {syncResults.customers.total} σύνολο</span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <button className="btn-secondary" onClick={syncAgreements} disabled={syncing.agreements}>
            {syncing.agreements ? 'Επεξεργασία...' : '📋 Δημιουργία Συμφωνιών από ΕΣΟΔΑ'}
          </button>
          {syncResults.agreements && (
            <span className="text-xs text-slate-500">{syncResults.agreements.created} νέες · {syncResults.agreements.skipped} υπάρχουσες · {syncResults.agreements.total} σύνολο</span>
          )}
        </div>
      </div>
    </div>
  );
}

function ImportSection({ title, endpoint, deleteEndpoint, description, note, sourceSheet, color = 'bg-indigo-500' }) {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const inputRef = useRef();

  const handleImport = async () => {
    if (!file) return toast.error('Επιλέξτε αρχείο');
    setLoading(true);
    const form = new FormData();
    form.append('file', file);
    if (sourceSheet) form.append('source_sheet', sourceSheet);
    try {
      const res = await api.post(endpoint, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setResult(res.data);
      toast.success(`Εισήχθησαν ${res.data.imported} εγγραφές!`);
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
    } catch (e) {
      toast.error(e.response?.data?.error || 'Σφάλμα εισαγωγής');
    } finally { setLoading(false); }
  };

  const handleDelete = async () => {
    if (!window.confirm('Σίγουρα να διαγραφούν ΟΛΕΣ οι εγγραφές;')) return;
    setDeleting(true);
    try {
      await api.delete(deleteEndpoint);
      toast.success('Διαγράφηκαν όλες οι εγγραφές');
      setResult(null);
    } catch {
      toast.error('Σφάλμα διαγραφής');
    } finally { setDeleting(false); }
  };

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center shrink-0`}>
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-white">
              <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z"/>
              <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z"/>
            </svg>
          </div>
          <div>
            <h2 className="font-bold text-slate-800">{title}</h2>
            <p className="text-sm text-slate-500 mt-0.5">{description}</p>
            {note && (
              <p className="text-xs text-amber-700 mt-1.5 bg-amber-50 rounded-lg px-3 py-1.5 border border-amber-100">
                ⚠️ {note}
              </p>
            )}
          </div>
        </div>
        <button onClick={handleDelete} disabled={deleting}
          className="btn-danger btn-sm shrink-0">
          {deleting ? 'Διαγραφή...' : 'Διαγραφή Όλων'}
        </button>
      </div>

      <div className="flex items-center gap-3">
        <label className="flex-1 flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed border-slate-200 hover:border-primary-300 cursor-pointer transition-colors group">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-slate-400 group-hover:text-primary-500 shrink-0 transition-colors">
            <path d="M3 3.5A1.5 1.5 0 0 1 4.5 2h6.879a1.5 1.5 0 0 1 1.06.44l4.122 4.12A1.5 1.5 0 0 1 17 7.622V16.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 16.5v-13Z"/>
          </svg>
          <span className={`text-sm ${file ? 'text-slate-800 font-medium' : 'text-slate-400'}`}>
            {file ? file.name : 'Επιλογή αρχείου CSV…'}
          </span>
          <input ref={inputRef} type="file" accept=".csv,.txt" className="hidden"
            onChange={e => setFile(e.target.files[0])} />
        </label>
        <button className="btn-primary" onClick={handleImport} disabled={!file || loading}>
          {loading ? 'Εισαγωγή...' : 'Εισαγωγή'}
        </button>
      </div>

      {result && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-100 text-sm text-emerald-800">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-emerald-500 shrink-0">
            <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd"/>
          </svg>
          Εισήχθησαν <strong className="mx-1">{result.imported}</strong> από <strong className="mx-1">{result.total}</strong> γραμμές
        </div>
      )}
    </div>
  );
}

export default function ImportPage() {
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Εισαγωγή Δεδομένων</h1>
          <p className="page-sub">Μεταφορά δεδομένων από Google Sheets</p>
        </div>
      </div>

      <div className="card p-5" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.06), rgba(139,92,246,0.06))', border: '1px solid rgba(99,102,241,0.15)' }}>
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0 mt-0.5">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-indigo-600">
              <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z" clipRule="evenodd"/>
            </svg>
          </div>
          <div>
            <h3 className="font-bold text-slate-800 mb-2">Οδηγίες Εξαγωγής από Google Sheets</h3>
            <ol className="text-sm text-slate-600 space-y-1 list-decimal list-inside">
              <li>Ανοίξτε το Google Sheet</li>
              <li>Επιλέξτε το φύλλο (ΕΣΟΔΑ, ΕΞΟΔΑ ή ΕΞΟΔΑ2)</li>
              <li>Μενού: <strong>Αρχείο → Λήψη → Τιμές διαχωρισμένες με κόμμα (.csv)</strong></li>
              <li>Ανεβάστε το αρχείο παρακάτω</li>
            </ol>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <ImportSection
          title="Εισαγωγή ΕΣΟΔΑ"
          endpoint="/import/income"
          deleteEndpoint="/import/income"
          color="bg-emerald-500"
          description="CSV από το φύλλο ΕΣΟΔΑ. Αναγνωρίζει ελληνικές ημερομηνίες (π.χ. 31-Ιουλ-2017) και ποσά με ελληνική μορφοποίηση."
        />
        <ImportSection
          title="Εισαγωγή ΕΞΟΔΑ"
          endpoint="/import/expenses"
          deleteEndpoint="/import/expenses"
          color="bg-rose-500"
          sourceSheet="ΕΞΟΔΑ"
          description="CSV από το φύλλο ΕΞΟΔΑ."
        />
        <ImportSection
          title="Εισαγωγή ΕΞΟΔΑ2"
          endpoint="/import/expenses"
          deleteEndpoint="/import/expenses"
          color="bg-orange-500"
          sourceSheet="ΕΞΟΔΑ2"
          description="CSV από το φύλλο ΕΞΟΔΑ2."
          note="Το κουμπί 'Διαγραφή Όλων' διαγράφει ΚΑΙ τα δεδομένα του ΕΞΟΔΑ."
        />
        <SyncSection />
      </div>
    </div>
  );
}
