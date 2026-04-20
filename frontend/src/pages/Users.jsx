import { useState, useEffect, useCallback } from 'react'
import {
  UsersIcon,
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  XMarkIcon,
  KeyIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { getUsers, createUser, updateUser, deleteUser } from '../api'

const ROLES = ['admin', 'agent']

const ROLE_COLORS = {
  admin: 'bg-purple-100 text-purple-700',
  agent: 'bg-blue-100 text-blue-700',
}

const ROLE_LABELS = {
  admin: 'Διαχειριστής',
  agent: 'Agent',
}

const EMPTY_FORM = {
  username: '',
  full_name: '',
  email: '',
  phone: '',
  role: 'agent',
  password: '',
}

function UserModal({ user, onClose, onSaved }) {
  const isEdit = Boolean(user)
  const [form, setForm] = useState(isEdit ? { ...EMPTY_FORM, ...user, password: '' } : { ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)

  const f = (key) => ({
    value: form[key],
    onChange: e => setForm(p => ({ ...p, [key]: e.target.value })),
  })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = { ...form }
      if (isEdit && !payload.password) delete payload.password
      if (isEdit) {
        await updateUser(user.id, payload)
        toast.success('Ο χρήστης ενημερώθηκε')
      } else {
        await createUser(payload)
        toast.success('Ο χρήστης δημιουργήθηκε')
      }
      onSaved()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Σφάλμα αποθήκευσης')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="p-5 border-b flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">
            {isEdit ? 'Επεξεργασία Χρήστη' : 'Νέος Χρήστης'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="label">Ονοματεπώνυμο *</label>
            <input className="input" required {...f('full_name')} placeholder="π.χ. Γιώργος Παπαδόπουλος" />
          </div>
          <div>
            <label className="label">Όνομα χρήστη *</label>
            <input className="input" required {...f('username')} placeholder="π.χ. gpapadopoulos" />
          </div>
          <div>
            <label className="label">Email *</label>
            <input className="input" type="email" required {...f('email')} placeholder="email@example.com" />
          </div>
          <div>
            <label className="label">Τηλέφωνο</label>
            <input className="input" {...f('phone')} placeholder="69XXXXXXXX" />
          </div>
          <div>
            <label className="label">Ρόλος *</label>
            <select className="input" required {...f('role')}>
              {ROLES.map(r => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label flex items-center gap-1.5">
              <KeyIcon className="w-3.5 h-3.5" />
              {isEdit ? 'Νέος Κωδικός (προαιρετικό)' : 'Κωδικός *'}
            </label>
            <input
              className="input"
              type="password"
              required={!isEdit}
              {...f('password')}
              placeholder={isEdit ? 'Αφήστε κενό για να μην αλλάξει' : 'Κωδικός πρόσβασης'}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 btn-secondary">
              Άκυρο
            </button>
            <button type="submit" disabled={saving} className="flex-1 btn-primary">
              {saving ? 'Αποθήκευση...' : isEdit ? 'Ενημέρωση' : 'Δημιουργία'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Users() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalUser, setModalUser] = useState(undefined) // undefined=closed, null=new, obj=edit

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setUsers(await getUsers())
    } catch {
      toast.error('Σφάλμα φόρτωσης χρηστών')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleDelete = async (user) => {
    if (!confirm(`Διαγραφή χρήστη "${user.full_name}";`)) return
    try {
      await deleteUser(user.id)
      toast.success('Ο χρήστης διαγράφηκε')
      load()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Σφάλμα διαγραφής')
    }
  }

  const handleToggleActive = async (user) => {
    try {
      await updateUser(user.id, { is_active: !user.is_active })
      toast.success(user.is_active ? 'Ο χρήστης απενεργοποιήθηκε' : 'Ο χρήστης ενεργοποιήθηκε')
      load()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Σφάλμα ενημέρωσης')
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-50 rounded-lg">
            <UsersIcon className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Χρήστες</h1>
            <p className="text-sm text-gray-500">{users.length} χρήστες</p>
          </div>
        </div>
        <button
          onClick={() => setModalUser(null)}
          className="btn-primary flex items-center gap-2"
        >
          <PlusIcon className="w-4 h-4" /> Νέος Χρήστης
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full" />
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <UsersIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Δεν βρέθηκαν χρήστες</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Ονοματεπώνυμο', 'Όνομα χρήστη', 'Email', 'Τηλέφωνο', 'Ρόλος', 'Κατάσταση', ''].map(h => (
                    <th
                      key={h}
                      className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map(user => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{user.full_name}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{user.username}</code>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{user.email || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{user.phone || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${ROLE_COLORS[user.role] || 'bg-gray-100 text-gray-600'}`}>
                        {ROLE_LABELS[user.role] || user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggleActive(user)}
                        className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
                          user.is_active
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-red-100 text-red-600 hover:bg-red-200'
                        }`}
                        title={user.is_active ? 'Κλικ για απενεργοποίηση' : 'Κλικ για ενεργοποίηση'}
                      >
                        {user.is_active
                          ? <><CheckCircleIcon className="w-3.5 h-3.5" /> Ενεργός</>
                          : <><XCircleIcon className="w-3.5 h-3.5" /> Ανενεργός</>
                        }
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setModalUser(user)}
                          className="text-gray-400 hover:text-blue-600 transition-colors"
                          title="Επεξεργασία"
                        >
                          <PencilSquareIcon className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(user)}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                          title="Διαγραφή"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalUser !== undefined && (
        <UserModal
          user={modalUser}
          onClose={() => setModalUser(undefined)}
          onSaved={() => { setModalUser(undefined); load() }}
        />
      )}
    </div>
  )
}
