import { useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'
import * as api from '../api'

export default function PerformanceAnalysisDashboard({ dateFromFilter, dateToFilter }) {
  const [metrics, setMetrics] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const loadMetrics = async () => {
      setLoading(true)
      try {
        const res = await api.getConsultantPerformanceMetrics(dateFromFilter, dateToFilter)
        setMetrics(res.data || {})
      } catch (err) {
        console.error('Failed to load performance metrics:', err)
        toast.error('Αποτυχία φόρτωσης μετρικών απόδοσης')
      } finally {
        setLoading(false)
      }
    }

    loadMetrics()
  }, [dateFromFilter, dateToFilter])

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6">
        <h3 className="text-sm font-black text-gray-700 mb-4">📊 Ανάλυση Απόδοσης Συμβούλων</h3>
        <div className="text-center py-8 text-gray-400">⏳ Φόρτωση...</div>
      </div>
    )
  }

  if (!metrics || Object.keys(metrics).length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6">
        <h3 className="text-sm font-black text-gray-700 mb-4">📊 Ανάλυση Απόδοσης Συμβούλων</h3>
        <div className="text-center py-8 text-gray-400">Δεν υπάρχουν δεδομένα</div>
      </div>
    )
  }

  const FOCUS_CONSULTANTS = ['STELLA', 'VALLIA', 'SOFIA']

  const consultants = Object.values(metrics)
    .filter(m => m.total_leads > 0 && FOCUS_CONSULTANTS.includes(m.consultant))
    .sort((a, b) => FOCUS_CONSULTANTS.indexOf(a.consultant) - FOCUS_CONSULTANTS.indexOf(b.consultant))

  const handleCopyReport = async () => {
    const report = consultants.map(m => {
      const lines = [
        `📊 ${m.consultant}`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `Leads: ${m.total_leads}`,
        `Μετατροπή → Case: ${m.conversion_rate_to_case}%`,
        `Μετατροπή → Hot: ${m.conversion_rate_to_hot}%`,
        `Hot → Case: ${m.conversion_hot_to_case}%`,
        `Cancel Rate: ${m.cancel_rate}%`,
        ``,
        `⚡ Προσπάθεια:`,
        `  Κλήσεις: ${m.calls_total} (${m.calls_per_lead} avg/lead, ${m.calls_answered} απάντησαν)`,
        `  Viber: ${m.vibers_total} (${m.vibers_per_lead} avg/lead)`,
        ``,
        `Cases: ${m.cases_total} (${m.cases_paying} paying)`,
        ``,
      ]
      return lines.join('\n')
    }).join('\n')

    const fullReport = `ΑΝΆΛΥΣΗ ΑΠΌΔΟΣΗΣ ΣΥΜΒΟΎΛΩΝ
════════════════════════════════════════════════════════════
${new Date().toLocaleDateString('el-GR')}
════════════════════════════════════════════════════════════

${report}

════════════════════════════════════════════════════════════
Παρατηρήσεις:
- Ο στόχος μετατροπής → Case είναι 30%+
- Κάθε lead χρειάζεται τουλάχιστον 3-4 κλήσεις
- Τουλάχιστον 2 Viber μηνύματα ανά lead
════════════════════════════════════════════════════════════`

    try {
      await navigator.clipboard.writeText(fullReport)
      toast.success('Έκθεση αντιγράφηκε στο Clipboard')
    } catch (err) {
      console.error('Failed to copy:', err)
      toast.error('Αποτυχία αντιγραφής')
    }
  }

  return (
    <div className="space-y-6 mb-6">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-black text-gray-700">📊 Ανάλυση Απόδοσης Συμβούλων</h3>
          <button
            onClick={handleCopyReport}
            className="text-xs px-3 py-1.5 bg-blue-100 text-blue-700 rounded font-semibold hover:bg-blue-200"
          >
            📋 Αντιγραφή Έκθεσης
          </button>
        </div>

        {/* Main Comparison Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left py-2 px-3 font-bold text-gray-700">Σύμβουλος</th>
                <th className="text-center py-2 px-3 font-bold text-gray-700">Leads</th>
                <th className="text-center py-2 px-3 font-bold text-blue-700">→Case %</th>
                <th className="text-center py-2 px-3 font-bold text-red-700">→Hot %</th>
                <th className="text-center py-2 px-3 font-bold text-orange-700">Hot→Case %</th>
                <th className="text-center py-2 px-3 font-bold text-gray-700">Cancel %</th>
                <th className="text-center py-2 px-3 font-bold text-green-700">Calls</th>
                <th className="text-center py-2 px-3 font-bold text-purple-700">Vibers</th>
              </tr>
            </thead>
            <tbody>
              {consultants.map(m => (
                <tr key={m.consultant} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 px-3 font-bold text-gray-800">{m.consultant}</td>
                  <td className="text-center py-2 px-3 text-gray-700">{m.total_leads}</td>
                  <td className="text-center py-2 px-3">
                    <div className={`font-bold ${m.conversion_rate_to_case >= 30 ? 'text-green-700' : m.conversion_rate_to_case >= 20 ? 'text-yellow-700' : 'text-red-700'}`}>
                      {m.conversion_rate_to_case}%
                    </div>
                    <div className="text-xs text-gray-500">({m.conversion_to_case_count || 0})</div>
                  </td>
                  <td className="text-center py-2 px-3">
                    <div className="font-bold text-red-700">{m.conversion_rate_to_hot}%</div>
                    <div className="text-xs text-gray-500">({m.conversion_to_hot_count || 0})</div>
                  </td>
                  <td className="text-center py-2 px-3">
                    <div className={`font-bold ${m.conversion_hot_to_case >= 50 ? 'text-green-700' : 'text-orange-700'}`}>
                      {m.conversion_hot_to_case}%
                    </div>
                    <div className="text-xs text-gray-500">({m.conversion_hot_to_case_count || 0})</div>
                  </td>
                  <td className="text-center py-2 px-3">
                    <div className="font-bold text-gray-700">{m.cancel_rate}%</div>
                    <div className="text-xs text-gray-500">({m.cancel_rate_count || 0})</div>
                  </td>
                  <td className="text-center py-2 px-3">
                    <div className="font-bold text-green-700">{m.calls_total}</div>
                    <div className="text-xs text-gray-500">{m.calls_per_lead} avg</div>
                  </td>
                  <td className="text-center py-2 px-3">
                    <div className="font-bold text-purple-700">{m.vibers_total}</div>
                    <div className="text-xs text-gray-500">{m.vibers_per_lead} avg</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed Analysis Cards */}
      {consultants.map(m => (
        <div key={m.consultant} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="mb-4">
            <h4 className="text-sm font-black text-gray-800">{m.consultant} — Λεπτομέρειες</h4>
            <p className="text-xs text-gray-500 mt-0.5">{m.total_leads} leads σε αυτήν την περίοδο</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Conversion Funnel */}
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4">
              <div className="text-xs font-bold text-blue-800 mb-3">漏斗 Μετατροπή Leads</div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">Σύνολο Leads (CALL):</span>
                  <span className="font-bold text-gray-800">{m.total_leads}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">→ Γίνονται HOT:</span>
                  <span className="font-bold text-red-700">{m.by_status.HOT || 0} ({m.conversion_rate_to_hot}%)</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">  → Γίνονται Case:</span>
                  <span className="font-bold text-green-700">{m.by_status.DEAL || 0} ({m.conversion_hot_to_case}%)</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">Συνολικές Υποθέσεις:</span>
                  <span className="font-bold text-green-700">{m.cases_total}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">  Πληρωτές:</span>
                  <span className="font-bold text-green-600">{m.cases_paying}</span>
                </div>
              </div>
            </div>

            {/* Effort Metrics */}
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4">
              <div className="text-xs font-bold text-purple-800 mb-3">⚡ Δείκτης Προσπάθειας</div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">Σύνολο Κλήσεων:</span>
                  <span className="font-bold text-green-700">{m.calls_total}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">  Απάντησαν:</span>
                  <span className="font-bold text-green-600">{m.calls_answered}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">Κλήσεις / Lead:</span>
                  <span className="font-bold text-orange-700">{m.calls_per_lead}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">Σύνολο Viber:</span>
                  <span className="font-bold text-purple-700">{m.vibers_total}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">Viber / Lead:</span>
                  <span className="font-bold text-purple-700">{m.vibers_per_lead}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Status Breakdown */}
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <div className="text-xs font-bold text-gray-700 mb-2">Κατανομή Κατάστασης</div>
            <div className="grid grid-cols-3 md:grid-cols-5 gap-2 text-xs">
              {Object.entries({
                CALL: 'CALL',
                HOT: 'HOT',
                DEAL: 'CASE',
                CANCEL: 'CANCEL',
                ACTIVE: 'ACTIVE',
              }).map(([status, label]) => {
                const count = m.by_status[status] || 0
                return (
                  <div key={status} className="bg-white p-2 rounded border border-gray-200">
                    <div className="text-gray-500">{label}</div>
                    <div className="font-bold text-gray-800">{count}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Bottleneck Analysis */}
          {m.conversion_hot_to_case < 50 && m.by_status.HOT > 0 && (
            <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="text-xs font-bold text-orange-800">⚠️ Δυσλειτουργία Εντοπίστηκε</div>
              <p className="text-xs text-orange-700 mt-1">
                Το 45,4% από HOT γίνονται Case (κάτω από το 50%).
                Συνιστάται: Αυξήστε τις κλήσεις προσπάθειας και τα Viber μηνύματα.
              </p>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
