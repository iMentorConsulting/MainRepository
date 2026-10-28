import { useState, useEffect } from 'react'
import { getMetaPages, createMetaPage, updateMetaPage, deleteMetaPage, getMetaLeadLog, getUsers } from '../api'
import toast from 'react-hot-toast'

const PROGRAMS = ['ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ', 'ΕΣΠΑ', 'ΔΥΠΑ', 'ΑΝΑΚΑΙΝΙΖΩ', 'ΔΥΠΑ-ΠΡΟΣΛΗΨΗΣ']
const WEBHOOK_URL = `${window.location.origin}/api/meta/webhook`

const EMPTY_FORM = {
  page_id: '', page_name: '', page_access_token: '', verify_token: '',
  default_program: '', default_program_title: '', assigned_agent_id: '', enabled: true,
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="text-xs text-blue-600 hover:underline shrink-0"
    >{copied ? '✓ Αντιγράφηκε' : 'Αντιγραφή'}</button>
  )
}

function PageForm({ page, agents, onSave, onCancel }) {
  const [form, setForm] = useState(page ? {
    page_id: page.page_id || '',
    page_name: page.page_name || '',
    page_access_token: '',
    verify_token: page.verify_token || '',
    default_program: page.default_program || '',
    default_program_title: page.default_program_title || '',
    assigned_agent_id: page.assigned_agent_id || '',
    enabled: page.enabled ?? true,
  } : { ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.page_id || !form.verify_token) {
      toast.error('Page ID και Verify Token είναι υποχρεωτικά')
      return
    }
    if (!page && !form.page_access_token) {
      toast.error('Page Access Token είναι υποχρεωτικό')
      return
    }
    setSaving(true)
    try {
      const payload = {
        ...form,
        assigned_agent_id: form.assigned_agent_id ? Number(form.assigned_agent_id) : null,
        page_access_token: form.page_access_token || undefined,
      }
      // Don't send empty token on edit (means "keep existing")
      if (page && !form.page_access_token) delete payload.page_access_token
      const saved = page
        ? await updateMetaPage(page.id, payload)
        : await createMetaPage(payload)
      onSave(saved)
      toast.success(page ? 'Αποθηκεύτηκε' : 'Η σελίδα προστέθηκε')
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Σφάλμα αποθήκευσης')
    } finally { setSaving(false) }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
      <h3 className="font-semibold text-gray-800">{page ? `Επεξεργασία: ${page.page_name || page.page_id}` : 'Νέα Facebook Σελίδα'}</h3>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Facebook Page ID *</label>
          <input value={form.page_id} onChange={e => set('page_id', e.target.value)}
            className="w-full border rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none" placeholder="123456789012345" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Όνομα Σελίδας</label>
          <input value={form.page_name} onChange={e => set('page_name', e.target.value)}
            className="w-full border rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none" placeholder="π.χ. iMentor Consulting" />
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Page Access Token * {page && <span className="text-gray-400">(άφησε κενό για να κρατήσεις το υπάρχον)</span>}</label>
        <input type="password" value={form.page_access_token} onChange={e => set('page_access_token', e.target.value)}
          className="w-full border rounded px-2 py-1.5 text-sm font-mono focus:ring-2 focus:ring-blue-400 focus:outline-none" placeholder={page ? '••••••••••••' : 'EAAxxxxxxxxxx...'} />
        <p className="text-[11px] text-gray-400 mt-1">Παίρνεις το token από το Meta Business Suite → Ρυθμίσεις → Σελίδες → "Δημιουργία Page Token".</p>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Verify Token * <span className="text-gray-400">(εσύ το ορίζεις — χρησιμοποιείται στις ρυθμίσεις Webhook)</span></label>
        <input value={form.verify_token} onChange={e => set('verify_token', e.target.value)}
          className="w-full border rounded px-2 py-1.5 text-sm font-mono focus:ring-2 focus:ring-blue-400 focus:outline-none" placeholder="imentor_meta_2024" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Default Πρόγραμμα</label>
          <select value={form.default_program} onChange={e => set('default_program', e.target.value)}
            className="w-full border rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none">
            <option value="">— Αυτόματη ανίχνευση —</option>
            {PROGRAMS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Default Σύμβουλος</label>
          <select value={form.assigned_agent_id} onChange={e => set('assigned_agent_id', e.target.value)}
            className="w-full border rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none">
            <option value="">— Χωρίς ανάθεση —</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
          </select>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" checked={form.enabled} onChange={e => set('enabled', e.target.checked)} className="rounded accent-blue-600" />
        <span>Ενεργό</span>
      </label>

      <div className="flex gap-2 pt-1">
        <button onClick={handleSave} disabled={saving}
          className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Αποθήκευση...' : 'Αποθήκευση'}
        </button>
        <button onClick={onCancel} className="px-4 py-1.5 text-sm border rounded-lg hover:bg-gray-50">Άκυρο</button>
      </div>
    </div>
  )
}

function StatusDot({ ok }) {
  return <span className={`inline-block w-2 h-2 rounded-full ${ok ? 'bg-green-500' : 'bg-gray-300'}`} />
}

export default function MetaAdsPage() {
  const [pages, setPages] = useState([])
  const [agents, setAgents] = useState([])
  const [log, setLog] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // null | 'new' | { page }
  const [showLog, setShowLog] = useState(false)
  const [logLoading, setLogLoading] = useState(false)

  useEffect(() => {
    Promise.all([
      getMetaPages(),
      getUsers(),
    ]).then(([p, a]) => { setPages(p); setAgents(a) })
      .catch(() => toast.error('Σφάλμα φόρτωσης'))
      .finally(() => setLoading(false))
  }, [])

  const loadLog = () => {
    setLogLoading(true)
    getMetaLeadLog(100).then(setLog).catch(() => toast.error('Σφάλμα φόρτωσης log'))
      .finally(() => setLogLoading(false))
  }

  const handleSaved = (saved) => {
    setPages(prev => {
      const idx = prev.findIndex(p => p.id === saved.id)
      if (idx >= 0) { const n = [...prev]; n[idx] = saved; return n }
      return [...prev, saved]
    })
    setEditing(null)
  }

  const handleDelete = async (page) => {
    if (!confirm(`Διαγραφή σελίδας "${page.page_name || page.page_id}";`)) return
    try {
      await deleteMetaPage(page.id)
      setPages(prev => prev.filter(p => p.id !== page.id))
      toast.success('Διαγράφηκε')
    } catch { toast.error('Σφάλμα διαγραφής') }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" /></div>

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Meta Lead Ads — Σύνδεση CRM</h1>
        <p className="text-sm text-gray-500 mt-1">Κάθε lead που συμπληρώνει τη φόρμα Meta Ads δημιουργείται αυτόματα στο Case Management.</p>
      </div>

      {/* Setup instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
        <h2 className="font-semibold text-blue-800 text-sm">⚙️ Οδηγίες σύνδεσης (Meta App Dashboard)</h2>
        <ol className="text-sm text-blue-700 space-y-1.5 list-decimal list-inside">
          <li>Πήγαινε στο <strong>Meta for Developers</strong> → Η Εφαρμογή σου → <strong>Webhooks</strong></li>
          <li>Επίλεξε <strong>Page</strong> και κάνε Subscribe στο <code className="bg-blue-100 px-1 rounded">leadgen</code> event</li>
          <li>Στο <strong>Callback URL</strong> βάλε:</li>
        </ol>
        <div className="flex items-center gap-2 bg-white border border-blue-200 rounded-lg px-3 py-2">
          <code className="flex-1 text-xs text-gray-700 break-all">{WEBHOOK_URL}</code>
          <CopyButton text={WEBHOOK_URL} />
        </div>
        <p className="text-xs text-blue-600">4. Στο <strong>Verify Token</strong> βάλε αυτό που έχεις ορίσει παρακάτω για κάθε σελίδα.</p>
        <p className="text-xs text-blue-600">5. Το <strong>Page Access Token</strong> το παίρνεις από Meta Business Suite → Settings → Pages → Generate Token.</p>
      </div>

      {/* Pages list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Συνδεδεμένες Σελίδες</h2>
          {editing !== 'new' && (
            <button onClick={() => setEditing('new')}
              className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
              + Προσθήκη Σελίδας
            </button>
          )}
        </div>

        {editing === 'new' && (
          <PageForm agents={agents} onSave={handleSaved} onCancel={() => setEditing(null)} />
        )}

        {pages.length === 0 && editing !== 'new' && (
          <div className="text-center py-10 text-gray-400 border-2 border-dashed rounded-xl">
            <p className="text-lg">Δεν υπάρχουν συνδεδεμένες σελίδες</p>
            <p className="text-sm mt-1">Πρόσθεσε μια Facebook Σελίδα για να ξεκινήσεις.</p>
          </div>
        )}

        {pages.map(page => (
          <div key={page.id}>
            {editing?.id === page.id ? (
              <PageForm page={editing} agents={agents} onSave={handleSaved} onCancel={() => setEditing(null)} />
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-start justify-between gap-4">
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <StatusDot ok={page.enabled} />
                    <span className="font-semibold text-gray-900">{page.page_name || page.page_id}</span>
                    {!page.enabled && <span className="text-xs text-gray-400">(ανενεργό)</span>}
                  </div>
                  <div className="text-xs text-gray-500 space-y-0.5">
                    <div>Page ID: <code className="bg-gray-100 px-1 rounded">{page.page_id}</code></div>
                    <div>Token: <code className="bg-gray-100 px-1 rounded">{page.page_access_token}</code></div>
                    <div>Verify Token: <code className="bg-gray-100 px-1 rounded">{page.verify_token}</code></div>
                    {page.default_program && <div>Default πρόγραμμα: <strong>{page.default_program}</strong></div>}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => setEditing(page)} className="text-sm text-blue-600 hover:underline">Επεξεργασία</button>
                  <button onClick={() => handleDelete(page)} className="text-sm text-red-500 hover:underline">Διαγραφή</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Lead log */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-800">Πρόσφατα Leads από Meta</h2>
          <button onClick={() => { setShowLog(true); loadLog() }}
            className="text-sm text-blue-600 hover:underline">
            {showLog ? 'Ανανέωση' : 'Εμφάνιση log'}
          </button>
        </div>
        {showLog && (
          logLoading ? (
            <div className="text-center py-6 text-gray-400 text-sm">Φόρτωση...</div>
          ) : log.length === 0 ? (
            <div className="text-center py-6 text-gray-400 text-sm border-2 border-dashed rounded-xl">Δεν υπάρχουν εγγραφές ακόμη</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-left text-gray-500">
                    <th className="px-3 py-2 font-medium border-b">Ημ/νία</th>
                    <th className="px-3 py-2 font-medium border-b">Καμπάνια / Διαφήμιση</th>
                    <th className="px-3 py-2 font-medium border-b">Πεδία</th>
                    <th className="px-3 py-2 font-medium border-b">Status</th>
                    <th className="px-3 py-2 font-medium border-b">Lead</th>
                  </tr>
                </thead>
                <tbody>
                  {log.map(row => (
                    <tr key={row.id} className="border-b hover:bg-gray-50">
                      <td className="px-3 py-2 whitespace-nowrap text-gray-500">
                        {row.created_at ? new Date(row.created_at).toLocaleString('el-GR') : '—'}
                      </td>
                      <td className="px-3 py-2 max-w-[200px]">
                        <div className="font-medium truncate">{row.campaign_name || '—'}</div>
                        <div className="text-gray-400 truncate">{row.ad_name}</div>
                      </td>
                      <td className="px-3 py-2 max-w-[200px]">
                        {(row.field_data || []).map((f, i) => (
                          <div key={i} className="truncate"><span className="text-gray-400">{f.name}:</span> {(f.values || [])[0] || '—'}</div>
                        ))}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full font-semibold ${row.status === 'ok' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                          {row.status}
                        </span>
                        {row.error && <div className="text-red-500 mt-0.5">{row.error}</div>}
                      </td>
                      <td className="px-3 py-2">
                        {row.lead_id ? (
                          <a href={`/leads?id=${row.lead_id}`} target="_blank" rel="noreferrer"
                            className="text-blue-600 hover:underline">#{row.lead_id}</a>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  )
}
