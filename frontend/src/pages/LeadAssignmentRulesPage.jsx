import { useEffect, useState } from 'react'
import { PlusIcon, TrashIcon, ArrowPathIcon, CheckIcon } from '@heroicons/react/24/outline'
import { getAssignmentRules, saveAssignmentRules, resetAssignmentCounts, getUsers } from '../api'
import toast from 'react-hot-toast'

const PROGRAM_GROUPS = [
  { key: 'ΕΣΠΑ', label: 'ΕΣΠΑ' },
  { key: 'ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ', label: 'Μικροπιστώσεις' },
  { key: 'ΔΥΠΑ', label: 'ΔΥΠΑ / ΟΑΕΔ' },
  { key: 'ΔΥΠΑ-ΠΡΟΣΛΗΨΗΣ', label: 'ΔΥΠΑ Προσλήψεων' },
  { key: 'ΑΝΑΚΑΙΝΙΖΩ', label: 'Ανακαινίζω' },
  { key: null, label: 'Catch-all (οποιοδήποτε πρόγραμμα)' },
]

export default function LeadAssignmentRulesPage() {
  const [rules, setRules] = useState([])  // { program_category, consultant_id, weight, sort_order, assignment_count?, consultant_name? }
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    Promise.all([getAssignmentRules(), getUsers()])
      .then(([r, u]) => {
        setRules(r)
        setUsers(Array.isArray(u) ? u : (u.items || []))
      })
      .catch(() => toast.error('Σφάλμα φόρτωσης κανόνων'))
      .finally(() => setLoading(false))
  }, [])

  const rulesForGroup = (key) => rules.filter(r => r.program_category === key)

  const addRule = (groupKey) => {
    if (users.length === 0) return
    // Find first user not already in this group
    const existing = new Set(rulesForGroup(groupKey).map(r => r.consultant_id))
    const available = users.filter(u => !existing.has(u.id))
    if (available.length === 0) {
      toast('Όλοι οι σύμβουλοι ήδη αναθέτονται σε αυτό το πρόγραμμα')
      return
    }
    setRules(prev => [
      ...prev,
      {
        program_category: groupKey,
        consultant_id: available[0].id,
        consultant_name: available[0].full_name,
        weight: 1,
        sort_order: 0,
        assignment_count: 0,
        _new: true,
      },
    ])
    setDirty(true)
  }

  const removeRule = (groupKey, consultantId) => {
    setRules(prev => prev.filter(r => !(r.program_category === groupKey && r.consultant_id === consultantId)))
    setDirty(true)
  }

  const changeWeight = (groupKey, consultantId, delta) => {
    setRules(prev => prev.map(r =>
      r.program_category === groupKey && r.consultant_id === consultantId
        ? { ...r, weight: Math.max(1, Math.min(20, (r.weight || 1) + delta)) }
        : r
    ))
    setDirty(true)
  }

  const changeConsultant = (groupKey, oldConsultantId, newConsultantId) => {
    const user = users.find(u => u.id === parseInt(newConsultantId))
    setRules(prev => prev.map(r =>
      r.program_category === groupKey && r.consultant_id === oldConsultantId
        ? { ...r, consultant_id: parseInt(newConsultantId), consultant_name: user?.full_name }
        : r
    ))
    setDirty(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = rules.map((r, i) => ({
        program_category: r.program_category,
        consultant_id: r.consultant_id,
        weight: r.weight || 1,
        sort_order: i,
      }))
      await saveAssignmentRules(payload)
      // Reload to get assignment_counts and IDs from server
      const fresh = await getAssignmentRules()
      setRules(fresh)
      setDirty(false)
      toast.success('Οι κανόνες αποθηκεύτηκαν')
    } catch {
      toast.error('Σφάλμα αποθήκευσης')
    } finally {
      setSaving(false)
    }
  }

  const handleResetCounts = async (groupKey) => {
    try {
      await resetAssignmentCounts(groupKey)
      setRules(prev => prev.map(r =>
        r.program_category === groupKey ? { ...r, assignment_count: 0 } : r
      ))
      toast.success('Μετρητές μηδενίστηκαν')
    } catch {
      toast.error('Σφάλμα μηδενισμού')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Κανόνες Αυτόματης Ανάθεσης</h1>
          <p className="text-sm text-gray-500 mt-1">
            Νέες αναθέσεις από Logistis ανατίθενται αυτόματα σε συμβούλους σύμφωνα με τα βάρη.
            Αν δεν υπάρχουν κανόνες για ένα πρόγραμμα, εμφανίζεται popup για χειροκίνητη αποδοχή.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className="btn-primary flex items-center gap-2 disabled:opacity-50"
        >
          <CheckIcon className="w-4 h-4" />
          {saving ? 'Αποθήκευση…' : 'Αποθήκευση'}
        </button>
      </div>

      {PROGRAM_GROUPS.map(group => {
        const groupRules = rulesForGroup(group.key)
        const availableToAdd = users.filter(u => !groupRules.some(r => r.consultant_id === u.id))

        return (
          <div key={String(group.key)} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-200">
              <h2 className="font-semibold text-gray-800">{group.label}</h2>
              <div className="flex items-center gap-2">
                {groupRules.length > 0 && (
                  <button
                    onClick={() => handleResetCounts(group.key)}
                    className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                    title="Μηδένισε τους μετρητές αναθέσεων"
                  >
                    <ArrowPathIcon className="w-3.5 h-3.5" />
                    Μηδενισμός μετρητών
                  </button>
                )}
              </div>
            </div>

            <div className="divide-y divide-gray-100">
              {groupRules.length === 0 ? (
                <div className="px-5 py-4 text-sm text-gray-400 italic">
                  Δεν υπάρχουν κανόνες — νέες αναθέσεις θα εμφανίζονται ως popup
                </div>
              ) : (
                groupRules.map(rule => (
                  <div key={`${rule.program_category}-${rule.consultant_id}`}
                    className="flex items-center gap-4 px-5 py-3">
                    {/* Consultant picker */}
                    <div className="flex-1">
                      <select
                        value={rule.consultant_id}
                        onChange={e => changeConsultant(group.key, rule.consultant_id, e.target.value)}
                        className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400"
                      >
                        {users.map(u => (
                          <option key={u.id} value={u.id}>{u.full_name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Weight controls */}
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-xs text-gray-500 mr-1">Βάρος:</span>
                      <button
                        onClick={() => changeWeight(group.key, rule.consultant_id, -1)}
                        className="w-6 h-6 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 flex items-center justify-center text-sm"
                      >−</button>
                      <span className="w-8 text-center text-sm font-semibold">{rule.weight || 1}</span>
                      <button
                        onClick={() => changeWeight(group.key, rule.consultant_id, 1)}
                        className="w-6 h-6 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 flex items-center justify-center text-sm"
                      >+</button>
                    </div>

                    {/* Assignment count */}
                    <span className="text-xs text-gray-400 shrink-0 w-20 text-right">
                      {rule.assignment_count ?? 0} αναθέσεις
                    </span>

                    {/* Remove */}
                    <button
                      onClick={() => removeRule(group.key, rule.consultant_id)}
                      className="text-red-400 hover:text-red-600 shrink-0"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}

              {/* Add consultant row */}
              {availableToAdd.length > 0 && (
                <div className="px-5 py-2.5">
                  <button
                    onClick={() => addRule(group.key)}
                    className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1.5"
                  >
                    <PlusIcon className="w-4 h-4" />
                    Προσθήκη συμβούλου
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      })}

      {dirty && (
        <div className="fixed bottom-6 right-6 z-50">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary shadow-xl flex items-center gap-2"
          >
            <CheckIcon className="w-4 h-4" />
            {saving ? 'Αποθήκευση…' : 'Αποθήκευση αλλαγών'}
          </button>
        </div>
      )}
    </div>
  )
}
