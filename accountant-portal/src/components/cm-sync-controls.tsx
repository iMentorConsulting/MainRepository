'use client'
import { Link2 } from 'lucide-react'

export interface CmSyncValue {
  notify: boolean
  leadStatus: '' | 'NEW' | 'ACTIVE' | 'HOT' | 'CALL' | 'CANCELLED'
  reminderDate: string // '' or yyyy-mm-dd
}

export const CM_SYNC_DEFAULT: CmSyncValue = { notify: true, leadStatus: '', reminderDate: '' }

const LEAD_STATUS_OPTIONS: { value: CmSyncValue['leadStatus']; label: string }[] = [
  { value: '', label: 'Χωρίς αλλαγή κατάστασης' },
  { value: 'NEW', label: 'Νέο Lead' },
  { value: 'ACTIVE', label: 'Ενεργό' },
  { value: 'HOT', label: '🔥 Hot' },
  { value: 'CALL', label: 'Προς Κλήση' },
  { value: 'CANCELLED', label: 'Ακυρώθηκε' },
]

// Shown right above the final "send" button on every client-facing email
// tool tied to one business+program. Pre-checked — sending one of these
// emails is, by default, a communication worth logging on the matching CM
// lead. See src/lib/case-management-sync.ts notifyCaseManagementCommunication
// for what each field does on the CM side.
export function CmSyncControls({ value, onChange }: { value: CmSyncValue; onChange: (v: CmSyncValue) => void }) {
  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-2">
      <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
        <input
          type="checkbox"
          checked={value.notify}
          onChange={e => onChange({ ...value, notify: e.target.checked })}
          className="cursor-pointer accent-indigo-600"
        />
        <Link2 size={13} className="text-gray-400" />
        Ενημέρωση Case Management (CRM)
      </label>
      {value.notify && (
        <div className="grid grid-cols-2 gap-2 pl-6">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Κατάσταση Lead</label>
            <select
              value={value.leadStatus}
              onChange={e => onChange({ ...value, leadStatus: e.target.value as CmSyncValue['leadStatus'] })}
              className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            >
              {LEAD_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Υπενθύμιση (προαιρετικό)</label>
            <input
              type="date"
              value={value.reminderDate}
              onChange={e => onChange({ ...value, reminderDate: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
        </div>
      )}
    </div>
  )
}

// Small post-send status line — shown once `cmSync` comes back from the API
// so the consultant knows whether CM actually got the update.
export function CmSyncResult({ cmSync }: { cmSync?: { delivered: boolean; found?: boolean } | null }) {
  if (!cmSync) return null
  if (!cmSync.delivered) {
    return <p className="text-xs text-amber-600">⚠️ Δεν ήταν δυνατή η ενημέρωση του Case Management (δεν είναι συνδεδεμένο ή απέτυχε η αποστολή).</p>
  }
  if (cmSync.found === false) {
    return <p className="text-xs text-amber-600">⚠️ Το Case Management δεν βρήκε αντίστοιχο lead για αυτόν τον πελάτη/πρόγραμμα.</p>
  }
  return <p className="text-xs text-emerald-600">✔️ Ενημερώθηκε το Case Management.</p>
}
