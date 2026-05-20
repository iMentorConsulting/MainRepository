import { useState, useEffect, useCallback } from 'react'
import api from '../api'
import toast from 'react-hot-toast'
import { BellAlertIcon, CheckCircleIcon } from '@heroicons/react/24/outline'

export default function StatusNotificationsPage() {
  const [pipelines, setPipelines] = useState({})   // { ΕΣΠΑ: { label, phases, extra_statuses }, ... }
  const [configs, setConfigs] = useState({})        // { [status]: boolean }
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [pipelineRes, configRes] = await Promise.all([
        api.get('/api/cm/admin/pipeline'),
        api.get('/api/cm/notifications/status-configs'),
      ])

      setPipelines(pipelineRes.data)

      // Build a flat map: status -> enabled
      const cfgMap = {}
      for (const item of (configRes.data.configs || [])) {
        cfgMap[item.status] = item.enabled
      }
      setConfigs(cfgMap)

      // Set first tab
      const programs = Object.keys(pipelineRes.data)
      if (programs.length > 0 && !activeTab) {
        setActiveTab(programs[0])
      }
    } catch (err) {
      toast.error('Σφάλμα φόρτωσης δεδομένων')
    } finally {
      setLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleToggle = (status) => {
    setConfigs(prev => ({ ...prev, [status]: !prev[status] }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // Collect all statuses across all programs
      const allStatuses = []
      for (const prog of Object.values(pipelines)) {
        for (const phase of (prog.phases || [])) {
          for (const status of (phase.statuses || [])) {
            allStatuses.push(status)
          }
        }
        for (const status of (prog.extra_statuses || [])) {
          allStatuses.push(status)
        }
      }

      const configItems = allStatuses.map(status => ({
        status,
        enabled: !!configs[status],
      }))

      await api.post('/api/cm/notifications/status-configs/bulk', { configs: configItems })
      toast.success('Αποθηκεύτηκε επιτυχώς')
    } catch (err) {
      toast.error('Σφάλμα αποθήκευσης')
    } finally {
      setSaving(false)
    }
  }

  const programs = Object.keys(pipelines)

  const enabledCount = Object.values(configs).filter(Boolean).length

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-blue-100 rounded-lg">
            <BellAlertIcon className="w-6 h-6 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Ειδοποιήσεις Μεταβολής Status</h1>
        </div>
        <p className="text-gray-500 text-sm mt-1">
          Επιλέξτε για ποιά στάδια επεξεργασίας να αποστέλλεται αυτόματο email στον πελάτη όταν η υπόθεσή του μεταβαίνει σε αυτό το στάδιο.
        </p>
        {enabledCount > 0 && (
          <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm font-medium">
            <CheckCircleIcon className="w-4 h-4" />
            {enabledCount} στάδια με ενεργή ειδοποίηση
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : (
        <>
          {/* Program Tabs */}
          {programs.length > 0 && (
            <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
              {programs.map(prog => (
                <button
                  key={prog}
                  onClick={() => setActiveTab(prog)}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    activeTab === prog
                      ? 'bg-white text-blue-700 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {pipelines[prog]?.label || prog}
                </button>
              ))}
            </div>
          )}

          {/* Active program content */}
          {activeTab && pipelines[activeTab] && (
            <div className="space-y-4">
              {/* Phase sections */}
              {(pipelines[activeTab].phases || []).map((phase, phaseIdx) => (
                <div key={phaseIdx} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                  <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                    <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                      {phase.label || `Φάση ${phaseIdx + 1}`}
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {(phase.statuses || []).length} στάδια
                    </p>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {(phase.statuses || []).map((status, statusIdx) => (
                      <StatusRow
                        key={statusIdx}
                        status={status}
                        enabled={!!configs[status]}
                        onToggle={() => handleToggle(status)}
                      />
                    ))}
                    {(phase.statuses || []).length === 0 && (
                      <div className="px-4 py-3 text-sm text-gray-400 italic">Δεν υπάρχουν στάδια</div>
                    )}
                  </div>
                </div>
              ))}

              {/* Extra statuses */}
              {(pipelines[activeTab].extra_statuses || []).length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                  <div className="bg-amber-50 px-4 py-3 border-b border-amber-200">
                    <h3 className="text-sm font-semibold text-amber-700 uppercase tracking-wide">
                      Ειδικά Στάδια
                    </h3>
                    <p className="text-xs text-amber-500 mt-0.5">
                      Εκτός κύκλου pipeline
                    </p>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {(pipelines[activeTab].extra_statuses || []).map((status, idx) => (
                      <StatusRow
                        key={idx}
                        status={status}
                        enabled={!!configs[status]}
                        onToggle={() => handleToggle(status)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Save button */}
          <div className="mt-6 flex items-center justify-between">
            <p className="text-xs text-gray-400">
              Οι αλλαγές εφαρμόζονται αμέσως μετά την αποθήκευση.
            </p>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {saving ? (
                <>
                  <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  Αποθήκευση...
                </>
              ) : (
                <>
                  <CheckCircleIcon className="w-4 h-4" />
                  Αποθήκευση
                </>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function StatusRow({ status, enabled, onToggle }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
      <span className="text-sm text-gray-800 font-medium">{status}</span>
      <button
        type="button"
        onClick={onToggle}
        role="switch"
        aria-checked={enabled}
        className={`relative inline-flex items-center w-10 h-5 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${
          enabled ? 'bg-blue-600' : 'bg-gray-300'
        }`}
      >
        <span
          className={`inline-block w-4 h-4 bg-white rounded-full shadow transform transition-transform ${
            enabled ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  )
}
