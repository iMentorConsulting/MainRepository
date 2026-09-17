import { useState } from 'react'
import { toast } from 'react-hot-toast'
import * as api from '../api'

export default function BulkImportForm({ onClose }) {
  const [jsonData, setJsonData] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)

  const handleImport = async () => {
    if (!jsonData.trim()) {
      toast.error('Παρακαλώ εισάγετε δεδομένα JSON')
      return
    }

    setLoading(true)
    try {
      const data = JSON.parse(jsonData)
      const res = await api.bulkImportCallsAndVibers(data)
      setResult(res.data)
      toast.success(`✅ Εισαγωγή ολοκληρώθηκε: ${res.data.stats.calls_imported} κλήσεις, ${res.data.stats.vibers_imported} viber`)
    } catch (err) {
      if (err instanceof SyntaxError) {
        toast.error('Μη έγκυρο JSON format')
      } else {
        toast.error('Σφάλμα κατά την εισαγωγή')
      }
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex justify-between items-center">
          <h2 className="text-lg font-black text-gray-800">📥 Εισαγωγή Ιστορικών Δεδομένων</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>

        <div className="p-6 space-y-4">
          {/* Instructions */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-900 font-semibold mb-2">Μορφή JSON:</p>
            <pre className="text-xs bg-white p-3 rounded border border-blue-100 overflow-x-auto text-blue-800">
{`{
  "calls": [
    {
      "lead_id": 123,
      "consultant": "STELLA",
      "date": "2024-01-15",
      "answered": true,
      "duration_seconds": 245,
      "notes": "Κάποιες σημειώσεις"
    }
  ],
  "vibers": [
    {
      "lead_id": 123,
      "consultant": "STELLA",
      "date": "2024-01-15",
      "message": "Κείμενο viber",
      "success": true
    }
  ]
}`}
            </pre>
          </div>

          {/* JSON Input */}
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-2">
              Δεδομένα JSON (κλήσεις ή/και viber):
            </label>
            <textarea
              value={jsonData}
              onChange={e => setJsonData(e.target.value)}
              placeholder="Επικολλήστε το JSON εδώ..."
              className="w-full h-48 p-3 border border-gray-300 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>

          {/* Result */}
          {result && (
            <div className={`p-4 rounded-lg border ${result.ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <p className={`font-semibold ${result.ok ? 'text-green-800' : 'text-red-800'}`}>
                {result.ok ? '✅ Επιτυχής' : '❌ Αποτυχίας'}
              </p>
              <div className={`text-sm mt-2 space-y-1 ${result.ok ? 'text-green-700' : 'text-red-700'}`}>
                <p>Κλήσεις εισάχθησαν: {result.stats.calls_imported}</p>
                <p>Κλήσεις αποτυχίας: {result.stats.calls_failed}</p>
                <p>Viber εισάχθησαν: {result.stats.vibers_imported}</p>
                <p>Viber αποτυχίας: {result.stats.vibers_failed}</p>
              </div>
              {result.stats.errors.length > 0 && (
                <div className="mt-3 text-xs font-mono bg-white p-2 rounded border border-red-200 text-red-800 max-h-32 overflow-y-auto">
                  {result.stats.errors.map((err, i) => <div key={i}>{err}</div>)}
                </div>
              )}
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 justify-end pt-4 border-t border-gray-200">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 font-semibold"
            >
              Ακύρωση
            </button>
            <button
              onClick={handleImport}
              disabled={loading}
              className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-semibold"
            >
              {loading ? '⏳ Εισαγωγή...' : '📥 Εισαγωγή'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
