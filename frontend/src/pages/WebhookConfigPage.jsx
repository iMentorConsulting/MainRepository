import { useState, useEffect } from 'react'
import {
  getWebhookSources, createWebhookSource, updateWebhookSource,
  deleteWebhookSource, regenerateWebhookToken, getWebhookLogs,
} from '../api'
import {
  PlusIcon, TrashIcon, PencilIcon, ArrowPathIcon,
  ClipboardDocumentIcon, CheckIcon, GlobeAltIcon,
  ListBulletIcon, XMarkIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const PROGRAMS = ['ΕΣΠΑ', 'ΔΥΠΑ', 'ΔΥΠΑ-ΠΡΟΣΛΗΨΗΣ', 'ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ', 'ΑΝΑΚΑΙΝΙΖΩ']

const LEAD_FIELDS = [
  { key: 'name', label: 'Ονοματεπώνυμο' },
  { key: 'phone', label: 'Τηλέφωνο (κύριο)' },
  { key: 'phone2', label: 'Τηλέφωνο (2ο)' },
  { key: 'email', label: 'Email' },
  { key: 'afm', label: 'ΑΦΜ' },
  { key: 'program_title', label: 'Τίτλος Προγράμματος' },
  { key: 'notes', label: 'Σημειώσεις (συγκεντρώνονται)' },
  { key: 'service_type', label: 'Τύπος Υπηρεσίας' },
  { key: 'program', label: 'Πρόγραμμα (κατηγορία — ανίχνευση)' },
]

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const handle = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={handle} className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 px-2 py-1 rounded hover:bg-blue-50 transition-colors">
      {copied ? <CheckIcon className="w-3.5 h-3.5 text-green-500" /> : <ClipboardDocumentIcon className="w-3.5 h-3.5" />}
      {copied ? 'Αντιγράφηκε' : 'Αντιγραφή'}
    </button>
  )
}

function FieldMapEditor({ fieldMap, onChange }) {
  const [rows, setRows] = useState(() =>
    Object.entries(fieldMap || {}).map(([k, v]) => ({ form: k, lead: v }))
  )

  const sync = (newRows) => {
    setRows(newRows)
    const map = {}
    newRows.forEach(r => { if (r.form && r.lead) map[r.form] = r.lead })
    onChange(map)
  }

  const add = () => sync([...rows, { form: '', lead: 'name' }])
  const del = (i) => sync(rows.filter((_, j) => j !== i))
  const upd = (i, k, v) => sync(rows.map((r, j) => j === i ? { ...r, [k]: v } : r))

  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="flex gap-2 items-center">
          <input
            className="flex-1 border rounded px-2 py-1 text-xs focus:ring-1 focus:ring-blue-500"
            placeholder="Πεδίο φόρμας (π.χ. full_name)"
            value={r.form}
            onChange={e => upd(i, 'form', e.target.value)}
          />
          <span className="text-gray-400 text-xs">→</span>
          <select
            className="flex-1 border rounded px-2 py-1 text-xs focus:ring-1 focus:ring-blue-500"
            value={r.lead}
            onChange={e => upd(i, 'lead', e.target.value)}
          >
            {LEAD_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <button onClick={() => del(i)} className="text-red-400 hover:text-red-600 p-1"><TrashIcon className="w-3.5 h-3.5" /></button>
        </div>
      ))}
      <button onClick={add} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
        <PlusIcon className="w-3.5 h-3.5" /> Προσθήκη αντιστοίχισης
      </button>
    </div>
  )
}

function ProgramMapEditor({ programMap, onChange }) {
  const [rows, setRows] = useState(() =>
    Object.entries(programMap || {}).map(([k, v]) => ({ value: k, program: v }))
  )

  const sync = (newRows) => {
    setRows(newRows)
    const map = {}
    newRows.forEach(r => { if (r.value && r.program) map[r.value] = r.program })
    onChange(map)
  }

  const add = () => sync([...rows, { value: '', program: 'ΕΣΠΑ' }])
  const del = (i) => sync(rows.filter((_, j) => j !== i))
  const upd = (i, k, v) => sync(rows.map((r, j) => j === i ? { ...r, [k]: v } : r))

  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="flex gap-2 items-center">
          <input
            className="flex-1 border rounded px-2 py-1 text-xs focus:ring-1 focus:ring-blue-500"
            placeholder="Τιμή φόρμας (π.χ. espa)"
            value={r.value}
            onChange={e => upd(i, 'value', e.target.value)}
          />
          <span className="text-gray-400 text-xs">→</span>
          <select
            className="flex-1 border rounded px-2 py-1 text-xs focus:ring-1 focus:ring-blue-500"
            value={r.program}
            onChange={e => upd(i, 'program', e.target.value)}
          >
            {PROGRAMS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <button onClick={() => del(i)} className="text-red-400 hover:text-red-600 p-1"><TrashIcon className="w-3.5 h-3.5" /></button>
        </div>
      ))}
      <button onClick={add} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
        <PlusIcon className="w-3.5 h-3.5" /> Προσθήκη αντιστοίχισης
      </button>
    </div>
  )
}

function SourceModal({ source, onClose, onSaved }) {
  const isNew = !source
  const [form, setForm] = useState({
    name: source?.name || '',
    default_program: source?.default_program || '',
    default_program_title: source?.default_program_title || '',
    field_map: source?.field_map || {},
    program_map: source?.program_map || {},
    enabled: source?.enabled ?? true,
    notes: source?.notes || '',
  })
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!form.name.trim()) { toast.error('Απαιτείται όνομα'); return }
    setBusy(true)
    try {
      if (isNew) {
        await createWebhookSource(form)
        toast.success('Δημιουργήθηκε')
      } else {
        await updateWebhookSource(source.id, form)
        toast.success('Αποθηκεύτηκε')
      }
      onSaved()
      onClose()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Σφάλμα')
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="p-5 border-b flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">{isNew ? 'Νέα Πηγή Webhook' : `Επεξεργασία: ${source.name}`}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold">×</button>
        </div>
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* Basic */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Όνομα πηγής *</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                placeholder="π.χ. Website ΕΣΠΑ Form"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Προεπιλεγμένο Πρόγραμμα</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                value={form.default_program}
                onChange={e => setForm(f => ({ ...f, default_program: e.target.value }))}
              >
                <option value="">— Χωρίς προεπιλογή —</option>
                {PROGRAMS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <p className="text-xs text-gray-400 mt-1">Χρησιμοποιείται αν η φόρμα δεν αποστέλλει πεδίο προγράμματος</p>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Προεπιλεγμένος Τίτλος Προγράμματος</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                placeholder="π.χ. Πρόγραμμα επιχορήγησης επιχειρήσεων για την πρόσληψη 5.000 ανέργων…"
                value={form.default_program_title}
                onChange={e => setForm(f => ({ ...f, default_program_title: e.target.value }))}
              />
              <p className="text-xs text-gray-400 mt-1">Εφαρμόζεται αν η φόρμα δεν αποστέλλει τίτλο προγράμματος — χρήσιμο για φόρμες αφιερωμένες σε ένα συγκεκριμένο πρόγραμμα</p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="enabled"
                checked={form.enabled}
                onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))}
                className="rounded"
              />
              <label htmlFor="enabled" className="text-sm font-medium text-gray-700">Ενεργό</label>
            </div>
          </div>

          {/* Field mapping */}
          <div>
            <h3 className="text-sm font-semibold text-gray-800 mb-2">Αντιστοίχιση Πεδίων</h3>
            <p className="text-xs text-gray-500 mb-3">
              Ορίστε ποιο πεδίο της φόρμας αντιστοιχεί σε κάθε πεδίο Lead.
              Τα συνηθισμένα ονόματα (name, phone, email, afm, message κ.ά.) αναγνωρίζονται αυτόματα.
              <br />
              <strong>Σημείωση:</strong> Πολλά πεδία μπορούν να αντιστοιχιστούν στις «Σημειώσεις» — θα συγκεντρωθούν αυτόματα με τη μορφή «πεδίο: τιμή».
            </p>
            <FieldMapEditor
              fieldMap={form.field_map}
              onChange={v => setForm(f => ({ ...f, field_map: v }))}
            />
          </div>

          {/* Program mapping */}
          <div>
            <h3 className="text-sm font-semibold text-gray-800 mb-2">Αντιστοίχιση Προγράμματος</h3>
            <p className="text-xs text-gray-500 mb-3">
              Αν η φόρμα έχει πεδίο επιλογής προγράμματος, αντιστοιχίστε τις τιμές της στις CM κατηγορίες.
              Π.χ. αν η φόρμα στέλνει "espa" → ΕΣΠΑ.
            </p>
            <ProgramMapEditor
              programMap={form.program_map}
              onChange={v => setForm(f => ({ ...f, program_map: v }))}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Σημειώσεις</label>
            <textarea
              rows={2}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="π.χ. Contact form κυρίας σελίδας"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>
        </div>
        <div className="p-5 border-t flex gap-3 justify-end">
          <button onClick={onClose} className="btn-secondary">Άκυρο</button>
          <button onClick={save} disabled={busy} className="btn-primary">{busy ? 'Αποθήκευση...' : 'Αποθήκευση'}</button>
        </div>
      </div>
    </div>
  )
}

function SubmissionLogModal({ source, onClose }) {
  const [logs, setLogs] = useState(null)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    getWebhookLogs(source.id)
      .then(setLogs)
      .catch(() => { toast.error('Σφάλμα φόρτωσης αρχείου καταγραφής'); onClose() })
  }, [source.id])

  const fmt = (iso) => {
    if (!iso) return '—'
    const d = new Date(iso)
    return d.toLocaleDateString('el-GR') + ' ' + d.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="p-5 border-b flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Αρχείο Υποβολών — {source.name}</h2>
            <p className="text-xs text-gray-500 mt-0.5">Τελευταίες 20 υποβολές από τη φόρμα (νεότερες πρώτα)</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><XMarkIcon className="w-5 h-5" /></button>
        </div>

        {logs === null ? (
          <div className="flex justify-center py-12"><div className="animate-spin w-7 h-7 border-4 border-blue-500 border-t-transparent rounded-full" /></div>
        ) : logs.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-16 text-gray-400">
            <ListBulletIcon className="w-12 h-12 mb-3 opacity-30" />
            <p className="font-medium">Δεν υπάρχουν καταγεγραμμένες υποβολές</p>
            <p className="text-sm mt-1">Κάντε μια υποβολή από τη φόρμα και ανανεώστε.</p>
          </div>
        ) : (
          <div className="flex flex-1 overflow-hidden">
            {/* List */}
            <div className="w-72 border-r overflow-y-auto flex-shrink-0">
              {logs.map(l => (
                <button
                  key={l.id}
                  onClick={() => setSelected(l)}
                  className={`w-full text-left px-4 py-3 border-b hover:bg-gray-50 transition-colors ${selected?.id === l.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''}`}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    {l.lead_created ? (
                      <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">✓ Lead</span>
                    ) : l.skip_reason === 'duplicate' ? (
                      <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full font-medium">Διπλό</span>
                    ) : (
                      <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium">✗ Απέτυχε</span>
                    )}
                    {l.lead_id && <span className="text-xs text-gray-400">#{l.lead_id}</span>}
                  </div>
                  <div className="text-xs text-gray-500">{fmt(l.received_at)}</div>
                  {l.mapped_fields?.name && <div className="text-xs font-medium text-gray-700 truncate mt-0.5">{l.mapped_fields.name}</div>}
                  {l.mapped_fields?.phone && <div className="text-xs text-gray-500">{l.mapped_fields.phone}</div>}
                  {!l.mapped_fields?.name && !l.mapped_fields?.phone && (
                    <div className="text-xs text-gray-400 italic">Δεν εντοπίστηκε επαφή</div>
                  )}
                </button>
              ))}
            </div>

            {/* Detail */}
            <div className="flex-1 overflow-y-auto p-5">
              {selected ? (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Τι έστειλε η φόρμα (raw payload)</h3>
                    <pre className="text-xs bg-gray-900 text-green-300 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap break-all">
                      {JSON.stringify(selected.raw_payload, null, 2)}
                    </pre>
                    <p className="text-xs text-gray-400 mt-1">Content-Type: {selected.content_type || '—'}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Τι αναγνωρίστηκε (mapped fields)</h3>
                    {selected.mapped_fields && Object.keys(selected.mapped_fields).length > 0 ? (
                      <div className="space-y-1">
                        {Object.entries(selected.mapped_fields).map(([k, v]) => (
                          <div key={k} className="flex gap-2 text-xs">
                            <span className="font-mono font-semibold text-blue-700 w-32 flex-shrink-0">{k}</span>
                            <span className="text-gray-700 break-all">{String(v)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 italic">Κανένα πεδίο δεν αναγνωρίστηκε</p>
                    )}
                  </div>
                  {selected.skip_reason === 'no_contact_info' && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
                      <strong>Γιατί δεν δημιουργήθηκε lead:</strong> Δεν εντοπίστηκε ούτε όνομα ούτε τηλέφωνο στα παραπάνω πεδία.
                      <br /><br />
                      Για να διορθώσεις: πρόσθεσε αντιστοίχιση πεδίου στην πηγή (π.χ. <code className="bg-red-100 px-1 rounded">your-name → name</code>) ή
                      βεβαιώσου ότι η φόρμα στέλνει πεδία με ονόματα που αναγνωρίζει το σύστημα.
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 py-16">
                  <p className="text-sm">Επίλεξε μια υποβολή από τη λίστα για να δεις λεπτομέρειες</p>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="p-4 border-t flex justify-between items-center">
          <p className="text-xs text-gray-400">Τα αρχεία διατηρούνται αυτόματα (τελευταίες 20 υποβολές)</p>
          <button onClick={onClose} className="btn-secondary text-sm">Κλείσιμο</button>
        </div>
      </div>
    </div>
  )
}

export default function WebhookConfigPage() {
  const [sources, setSources] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // null | 'new' | { source }
  const [logSource, setLogSource] = useState(null) // source to show logs for
  const [deleting, setDeleting] = useState(null)

  const load = () => {
    setLoading(true)
    getWebhookSources().then(setSources).catch(() => toast.error('Σφάλμα φόρτωσης')).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const handleDelete = async (s) => {
    if (!confirm(`Διαγραφή "${s.name}"; Η φόρμα δεν θα μπορεί πλέον να στέλνει leads.`)) return
    setDeleting(s.id)
    try {
      await deleteWebhookSource(s.id)
      toast.success('Διαγράφηκε')
      load()
    } catch { toast.error('Σφάλμα διαγραφής') } finally { setDeleting(null) }
  }

  const handleRegenerate = async (s) => {
    if (!confirm(`Ανανέωση token για "${s.name}"; Το παλιό URL θα σταματήσει να λειτουργεί αμέσως.`)) return
    try {
      const updated = await regenerateWebhookToken(s.id)
      setSources(prev => prev.map(x => x.id === s.id ? updated : x))
      toast.success('Νέο token δημιουργήθηκε')
    } catch { toast.error('Σφάλμα') }
  }

  const webhookUrl = (token) => `${window.location.origin}/api/webhook/lead/${token}`

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Webhook — Φόρμες Website</h1>
          <p className="text-sm text-gray-500 mt-1">Κάθε φόρμα του website στέλνει leads απευθείας στο σύστημα μέσω του δικού της URL.</p>
        </div>
        <button onClick={() => setModal('new')} className="btn-primary flex items-center gap-2">
          <PlusIcon className="w-4 h-4" /> Νέα Πηγή
        </button>
      </div>

      {/* How it works */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 space-y-2">
        <div className="font-semibold flex items-center gap-2"><GlobeAltIcon className="w-4 h-4" /> Πώς λειτουργεί</div>
        <ul className="list-disc list-inside space-y-1 text-blue-700">
          <li>Κάθε φόρμα παίρνει ένα μοναδικό <strong>webhook URL</strong> — ρύθμισέ το στο website σου ως POST endpoint.</li>
          <li>Η φόρμα στέλνει <code className="bg-blue-100 px-1 rounded">JSON</code> ή <code className="bg-blue-100 px-1 rounded">application/x-www-form-urlencoded</code> — και τα δύο γίνονται αποδεκτά.</li>
          <li>Αν υπάρχει ήδη lead με ίδιο ΑΦΜ ή τηλέφωνο, τα κενά πεδία ενημερώνονται (δεν δημιουργείται διπλό).</li>
          <li>Τα συνηθισμένα πεδία (<code className="bg-blue-100 px-1 rounded">name</code>, <code className="bg-blue-100 px-1 rounded">phone</code>, <code className="bg-blue-100 px-1 rounded">email</code>, <code className="bg-blue-100 px-1 rounded">afm</code>, <code className="bg-blue-100 px-1 rounded">message</code>) αναγνωρίζονται αυτόματα.</li>
        </ul>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin w-7 h-7 border-4 border-blue-500 border-t-transparent rounded-full" /></div>
      ) : sources.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <GlobeAltIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">Δεν υπάρχουν πηγές webhook</p>
          <p className="text-sm mt-1">Δημιούργησε μία για κάθε φόρμα του website σου.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sources.map(s => (
            <div key={s.id} className={`bg-white border rounded-xl p-5 ${!s.enabled ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-gray-900">{s.name}</span>
                    {!s.enabled && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Ανενεργό</span>}
                    {s.default_program && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{s.default_program}</span>
                    )}
                  </div>
                  {s.notes && <p className="text-xs text-gray-500 mb-2">{s.notes}</p>}

                  {/* Webhook URL */}
                  <div className="bg-gray-50 border rounded-lg px-3 py-2 flex items-center gap-2 mt-2">
                    <code className="flex-1 text-xs text-gray-700 truncate">{webhookUrl(s.token)}</code>
                    <CopyButton text={webhookUrl(s.token)} />
                  </div>

                  {/* Field & program maps summary */}
                  {Object.keys(s.field_map || {}).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {Object.entries(s.field_map).map(([k, v]) => (
                        <span key={k} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                          {k} → {v}
                        </span>
                      ))}
                    </div>
                  )}
                  {Object.keys(s.program_map || {}).length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {Object.entries(s.program_map).map(([k, v]) => (
                        <span key={k} className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">
                          "{k}" → {v}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={() => setLogSource(s)}
                    className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                    title="Αρχείο υποβολών"
                  >
                    <ListBulletIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setModal(s)}
                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Επεξεργασία"
                  >
                    <PencilIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleRegenerate(s)}
                    className="p-2 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                    title="Ανανέωση token"
                  >
                    <ArrowPathIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(s)}
                    disabled={deleting === s.id}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Διαγραφή"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Example payload */}
      <div className="bg-gray-50 border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Παράδειγμα Payload (JSON)</h3>
        <pre className="text-xs bg-gray-900 text-green-300 rounded-lg p-4 overflow-x-auto">{`POST /api/webhook/lead/<token>
Content-Type: application/json

{
  "name": "Γιώργης Παπαδόπουλος",
  "phone": "6971234567",
  "email": "giorgos@example.com",
  "afm": "123456789",
  "program": "espa",
  "message": "Ενδιαφέρομαι για επιχορήγηση"
}`}</pre>
      </div>

      {modal && (
        <SourceModal
          source={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={load}
        />
      )}

      {logSource && (
        <SubmissionLogModal
          source={logSource}
          onClose={() => setLogSource(null)}
        />
      )}
    </div>
  )
}
