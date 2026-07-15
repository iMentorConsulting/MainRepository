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
        // Use pipeline stats endpoint which has consistent case counts with the first table
        // Send dates in YYYY-MM-DD format (backend expects this format)
        const res = await api.getAnalyticsPipelineStatsByEmployee(dateFromFilter, dateToFilter)
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

  // Transform pipeline stats data to match expected format
  const consultants = Object.entries(metrics)
    .filter(([emp]) => FOCUS_CONSULTANTS.includes(emp) && emp !== 'HARIS')
    .map(([emp, stats]) => ({
      consultant: emp,
      total_leads: stats.total_cases || 0, // Use total cases as "leads" for compatibility
      total_cases: stats.total_cases || 0,
      cases_paying: stats.settled_accepted_count || stats.accepted_count || 0,
      cases_total: stats.total_cases || 0,
      closure_percentage: stats.closure_percentage || 0,
      settlement_acceptance_percentage: stats.settlement_acceptance_percentage || 0,
      stage_breakdown: stats.stage_breakdown || {},
      settlement_breakdown: stats.settlement_breakdown || {},
      collected_revenue: stats.collected_revenue || { first_payment: 0, second_payment: 0, total: 0 },
      calls_total: 0,
      calls_answered: 0,
      calls_per_lead: 0,
      vibers_total: 0,
      vibers_per_lead: 0,
      conversion_rate_to_case: 0,
      conversion_rate_to_hot: 0,
      conversion_hot_to_case: 0,
      cancel_rate: 0,
      by_status: {}
    }))
    .sort((a, b) => FOCUS_CONSULTANTS.indexOf(a.consultant) - FOCUS_CONSULTANTS.indexOf(b.consultant))

  const handleCopyReport = async () => {
    const report = consultants.map(m => {
      const lines = [
        `📊 ${m.consultant}`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `Σύνολο Υποθέσεων: ${m.total_cases}`,
        `Κλείσιμο: ${m.closure_percentage}% (${m.closed_count}/${m.closure_count})`,
        `Αποδοχή Ρύθμισης: ${m.settlement_acceptance_percentage}% (${m.accepted_count}/${m.settlement_count})`,
        ``,
        `💰 Εισπράξεις:`,
        `  1η πληρωμή: ${(m.collected_revenue?.first_payment || 0).toLocaleString('el-GR')}€`,
        `  2η πληρωμή: ${(m.collected_revenue?.second_payment || 0).toLocaleString('el-GR')}€`,
        `  Σύνολο: ${(m.collected_revenue?.total || 0).toLocaleString('el-GR')}€`,
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
                <th className="text-center py-2 px-3 font-bold text-gray-700">Σύνολο Υποθέσεων</th>
                <th className="text-center py-2 px-3 font-bold text-blue-700">Κλείσιμο %</th>
                <th className="text-center py-2 px-3 font-bold text-green-700">Αποδοχή %</th>
                <th className="text-center py-2 px-3 font-bold text-cyan-700">Σύνολο Εισπράχθη</th>
              </tr>
            </thead>
            <tbody>
              {consultants.map(m => (
                <tr key={m.consultant} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 px-3 font-bold text-gray-800">{m.consultant}</td>
                  <td className="text-center py-2 px-3 font-bold text-gray-800">{m.total_cases}</td>
                  <td className="text-center py-2 px-3">
                    <div className={`font-bold ${m.closure_percentage >= 40 ? 'text-green-700' : 'text-orange-700'}`}>
                      {m.closure_percentage}%
                    </div>
                  </td>
                  <td className="text-center py-2 px-3">
                    <div className={`font-bold ${m.settlement_acceptance_percentage >= 50 ? 'text-green-700' : 'text-orange-700'}`}>
                      {m.settlement_acceptance_percentage}%
                    </div>
                  </td>
                  <td className="text-center py-2 px-3">
                    <div className="font-bold text-cyan-700">{(m.collected_revenue?.total || 0).toLocaleString('el-GR')}€</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed Analysis Cards */}
      {consultants.map(m => {
        const hasStageBreakdown = m.stage_breakdown && Object.keys(m.stage_breakdown).length > 0
        if (!hasStageBreakdown) return null

        return (
        <div key={m.consultant} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="mb-4">
            <h4 className="text-sm font-black text-gray-800">{m.consultant} — Κατανομή</h4>
            <p className="text-xs text-gray-500 mt-0.5">{m.total_cases} υποθέσεις σε αυτήν την περίοδο</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Pipeline Stage Breakdown */}
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4">
              <div className="text-xs font-bold text-blue-800 mb-3">Pipeline Στάδια</div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">Θετική Ανταπόκριση:</span>
                  <span className="font-bold text-gray-800">{m.stage_breakdown?.θετική_ανταπόκριση || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">Σε Διαπραγμάτευση:</span>
                  <span className="font-bold text-gray-800">{m.stage_breakdown?.σε_διαπραγμάτευση || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">Έκλεισε:</span>
                  <span className="font-bold text-green-700">{m.stage_breakdown?.έκλεισε || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">Δεν Ενδιαφέρεται:</span>
                  <span className="font-bold text-orange-700">{m.stage_breakdown?.δεν_ενδιαφέρεται || 0}</span>
                </div>
              </div>
            </div>

            {/* Settlement Breakdown */}
            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4">
              <div className="text-xs font-bold text-green-800 mb-3">Ρύθμιση Κατάστασης</div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">Αποδοχή Ρύθμισης:</span>
                  <span className="font-bold text-green-700">{m.settlement_breakdown?.αποδοχή_ρύθμισης || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">Απόρριψη Ρύθμισης:</span>
                  <span className="font-bold text-red-700">{m.settlement_breakdown?.απόρριψη_ρύθμισης || 0}</span>
                </div>
                <div className="mt-3 pt-3 border-t border-green-200">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-700 font-bold">Σύνολο Εισπράχθη:</span>
                    <span className="font-bold text-green-700">{(m.collected_revenue?.total || 0).toLocaleString('el-GR')}€</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        )
      })}
    </div>
  )
}
