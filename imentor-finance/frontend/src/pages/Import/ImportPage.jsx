import { useState, useRef } from 'react';
import api from '../../api/client';
import toast from 'react-hot-toast';

function ImportSection({ title, endpoint, description, note }) {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef();

  const handleImport = async () => {
    if (!file) return toast.error('Επιλέξτε αρχείο');
    setLoading(true);
    const form = new FormData();
    form.append('file', file);
    if (endpoint.includes('expenses')) form.append('source_sheet', title.includes('2') ? 'ΕΞΟΔΑ2' : 'ΕΞΟΔΑ');
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

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-gray-500 mt-1">{description}</p>
        {note && <p className="text-xs text-amber-600 mt-1 bg-amber-50 rounded p-2">⚠️ {note}</p>}
      </div>
      <div className="flex items-center gap-3">
        <input ref={inputRef} type="file" accept=".csv,.txt" onChange={e => setFile(e.target.files[0])}
          className="block text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100" />
        <button className="btn-primary" onClick={handleImport} disabled={!file || loading}>
          {loading ? 'Εισαγωγή...' : '📥 Εισαγωγή'}
        </button>
      </div>
      {result && (
        <div className="bg-green-50 rounded-lg p-3 text-sm text-green-800">
          ✅ Εισήχθησαν <strong>{result.imported}</strong> από <strong>{result.total}</strong> γραμμές.
        </div>
      )}
    </div>
  );
}

export default function ImportPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Εισαγωγή Δεδομένων</h1>
        <p className="text-gray-500 text-sm mt-1">Μεταφορά δεδομένων από Google Sheets. Εξαγάγετε κάθε φύλλο ως CSV και ανεβάστε εδώ.</p>
      </div>

      <div className="card p-4 bg-blue-50 border border-blue-200">
        <h3 className="font-semibold text-blue-800 mb-2">📋 Οδηγίες Εξαγωγής από Google Sheets</h3>
        <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
          <li>Ανοίξτε το Google Sheet</li>
          <li>Επιλέξτε το φύλλο (ΕΣΟΔΑ, ΕΞΟΔΑ ή ΕΞΟΔΑ2)</li>
          <li>Μενού: <strong>Αρχείο → Λήψη → Τιμές διαχωρισμένες με κόμμα (.csv)</strong></li>
          <li>Ανεβάστε το αρχείο παρακάτω</li>
        </ol>
      </div>

      <div className="space-y-4">
        <ImportSection
          title="Εισαγωγή ΕΣΟΔΑ"
          endpoint="/import/income"
          description="CSV από το φύλλο ΕΣΟΔΑ. Η πρώτη γραμμή πρέπει να είναι τα headers."
        />
        <ImportSection
          title="Εισαγωγή ΕΞΟΔΑ"
          endpoint="/import/expenses"
          description="CSV από το φύλλο ΕΞΟΔΑ."
          note="Το φύλλο ΕΞΟΔΑ έχει headers στη 2η γραμμή. Αν το CSV έχει μια κενή/άσχετη πρώτη γραμμή, η εφαρμογή την παραλείπει αυτόματα."
        />
        <ImportSection
          title="Εισαγωγή ΕΞΟΔΑ2"
          endpoint="/import/expenses"
          description="CSV από το φύλλο ΕΞΟΔΑ2. Συγχωνεύεται με το ΕΞΟΔΑ."
          note="Οι εγγραφές θα σημανθούν ως source_sheet=ΕΞΟΔΑ2 για διαχωρισμό."
        />
      </div>
    </div>
  );
}
