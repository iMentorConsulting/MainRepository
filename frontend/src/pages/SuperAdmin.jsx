import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { superadminListTenants, superadminCreateTenant, superadminUpdateTenant } from '../api'
import {
  BuildingOffice2Icon, PlusIcon, KeyIcon, CheckCircleIcon, XCircleIcon,
} from '@heroicons/react/24/outline'

function TenantCard({ tenant, onPasswordChange, onToggleActive }) {
  const [showPwForm, setShowPwForm] = useState(false)
  const [newPw, setNewPw] = useState('')
  const [saving, setSaving] = useState(false)

  const savePw = async () => {
    if (!newPw.trim()) return
    setSaving(true)
    try {
      await onPasswordChange(tenant.id, newPw.trim())
      setNewPw('')
      setShowPwForm(false)
      toast.success('Κωδικός ενημερώθηκε')
    } catch { toast.error('Σφάλμα') } finally { setSaving(false) }
  }

  return (
    <div className={`bg-white rounded-xl border p-5 space-y-3 ${tenant.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-800">{tenant.name}</h3>
            {tenant.is_active
              ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Ενεργή</span>
              : <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">Ανενεργή</span>}
          </div>
          <p className="text-xs text-gray-400 mt-0.5 font-mono">@{tenant.id}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowPwForm(s => !s)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-[#1e3a5f] px-2 py-1 rounded-lg hover:bg-gray-100 border border-gray-200 transition-colors"
          >
            <KeyIcon className="h-3.5 w-3.5" />
            Κωδικός
          </button>
          <button
            onClick={() => onToggleActive(tenant.id, !tenant.is_active)}
            className={`text-xs px-2 py-1 rounded-lg border transition-colors ${
              tenant.is_active
                ? 'text-red-500 hover:text-red-700 border-red-200 hover:bg-red-50'
                : 'text-green-600 hover:text-green-700 border-green-200 hover:bg-green-50'
            }`}
          >
            {tenant.is_active ? 'Απενεργοποίηση' : 'Ενεργοποίηση'}
          </button>
        </div>
      </div>

      {showPwForm && (
        <div className="flex gap-2">
          <input
            type="text"
            className="input text-sm flex-1"
            placeholder="Νέος κωδικός..."
            value={newPw}
            onChange={e => setNewPw(e.target.value)}
            autoFocus
          />
          <button
            onClick={savePw}
            disabled={saving || !newPw.trim()}
            className="px-3 py-1.5 bg-[#1e3a5f] text-white text-xs rounded-lg disabled:opacity-50"
          >
            {saving ? '...' : 'Αποθήκευση'}
          </button>
          <button onClick={() => { setShowPwForm(false); setNewPw('') }}
            className="px-3 py-1.5 text-gray-500 text-xs rounded-lg hover:bg-gray-100">
            Ακύρωση
          </button>
        </div>
      )}
    </div>
  )
}

export default function SuperAdmin({ onLogout }) {
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ id: '', name: '', password: '' })
  const [creating, setCreating] = useState(false)

  const load = () => {
    setLoading(true)
    superadminListTenants()
      .then(r => setTenants(r.data))
      .catch(() => toast.error('Σφάλμα φόρτωσης'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    setCreating(true)
    try {
      await superadminCreateTenant(form)
      toast.success(`Επιχείρηση "${form.name}" δημιουργήθηκε`)
      setForm({ id: '', name: '', password: '' })
      setShowCreate(false)
      load()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Σφάλμα')
    } finally { setCreating(false) }
  }

  const handlePasswordChange = async (id, password) => {
    await superadminUpdateTenant(id, { password })
    setTenants(ts => ts.map(t => t.id === id ? { ...t } : t))
  }

  const handleToggleActive = async (id, is_active) => {
    try {
      await superadminUpdateTenant(id, { is_active })
      setTenants(ts => ts.map(t => t.id === id ? { ...t, is_active } : t))
      toast.success(is_active ? 'Επιχείρηση ενεργοποιήθηκε' : 'Επιχείρηση απενεργοποιήθηκε')
    } catch { toast.error('Σφάλμα') }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-[#1e3a5f] text-white">
        <div className="max-w-3xl mx-auto px-4 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
              <BuildingOffice2Icon className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Super Admin</h1>
              <p className="text-xs text-blue-200">Διαχείριση Επιχειρήσεων</p>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="text-xs text-blue-200 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            Αποσύνδεση
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {/* Stats bar */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-[#1e3a5f]">{tenants.length}</div>
            <div className="text-xs text-gray-500">Σύνολο Επιχειρήσεων</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{tenants.filter(t => t.is_active).length}</div>
            <div className="text-xs text-gray-500">Ενεργές</div>
          </div>
          <div className="ml-auto">
            <button
              onClick={() => setShowCreate(s => !s)}
              className="flex items-center gap-2 bg-[#1e3a5f] text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-[#162d4a] transition-colors"
            >
              <PlusIcon className="h-4 w-4" />
              Νέα Επιχείρηση
            </button>
          </div>
        </div>

        {/* Create form */}
        {showCreate && (
          <div className="bg-white rounded-xl border border-[#1e3a5f]/30 p-5 space-y-4">
            <h2 className="font-semibold text-gray-800 text-sm">Νέα Επιχείρηση</h2>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 font-medium">Username (ID)</label>
                  <input
                    className="input mt-1"
                    placeholder="π.χ. myhotel"
                    value={form.id}
                    onChange={e => setForm(f => ({ ...f, id: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') }))}
                    required
                    pattern="[a-z0-9_-]{2,40}"
                    title="Μόνο πεζά γράμματα, αριθμοί, _ ή -"
                  />
                  <p className="text-xs text-gray-400 mt-0.5">Αυτό χρησιμοποιείται ως username για login</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium">Κωδικός</label>
                  <input
                    className="input mt-1"
                    type="text"
                    placeholder="Κωδικός πρόσβασης"
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Επωνυμία</label>
                <input
                  className="input mt-1"
                  placeholder="π.χ. MY HOTEL APARTMENTS"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 bg-[#1e3a5f] text-white text-sm font-semibold py-2 rounded-xl hover:bg-[#162d4a] disabled:opacity-50"
                >
                  {creating ? 'Δημιουργία...' : 'Δημιουργία Επιχείρησης'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowCreate(false); setForm({ id: '', name: '', password: '' }) }}
                  className="px-4 text-sm text-gray-500 hover:bg-gray-100 rounded-xl"
                >
                  Ακύρωση
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Tenant list */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin w-8 h-8 border-4 border-[#1e3a5f] border-t-transparent rounded-full" />
          </div>
        ) : tenants.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <BuildingOffice2Icon className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Δεν υπάρχουν επιχειρήσεις</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide px-1">Επιχειρήσεις</p>
            {tenants.map(t => (
              <TenantCard
                key={t.id}
                tenant={t}
                onPasswordChange={handlePasswordChange}
                onToggleActive={handleToggleActive}
              />
            ))}
          </div>
        )}

        {/* Login instructions */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
          <strong>Οδηγίες Login:</strong> Κάθε επιχείρηση εισέρχεται με το <strong>username</strong> (ID) και τον <strong>κωδικό</strong> της.
          Ο super admin εισέρχεται με username <code className="font-mono bg-blue-100 px-1 rounded">admin</code> και τον αντίστοιχο κωδικό.
        </div>
      </div>
    </div>
  )
}
