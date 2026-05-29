import { useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'
import { TrashIcon, PlusIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import * as api from '../api'

const TEMPLATE_TYPES = [
  { value: 'viber', label: '📱 Viber' },
  { value: 'email', label: '✉️ Email' },
  { value: 'both', label: '📱✉️ Και τα δύο' },
]

const VARS_HINT = '{name}  {total_debt}  {offer_amount}  {success_fee}  {phone}  {email}  {assigned_to}'

function TemplateForm({ initial, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || '')
  const [type, setType] = useState(initial?.type || 'viber')
  const [subject, setSubject] = useState(initial?.subject || '')
  const [body, setBody] = useState(initial?.body || '')

  const valid = name.trim() && body.trim()

  return (
    <div className="border border-blue-200 rounded-xl p-4 bg-blue-50 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 mb-0.5 block">Όνομα template *</label>
          <input className="input text-sm w-full" value={name} onChange={e => setName(e.target.value)} placeholder="π.χ. Πρόσκληση" />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-0.5 block">Τύπος</label>
          <select className="input text-sm w-full" value={type} onChange={e => setType(e.target.value)}>
            {TEMPLATE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>
      {(type === 'email' || type === 'both') && (
        <div>
          <label className="text-xs text-gray-500 mb-0.5 block">Θέμα email</label>
          <input className="input text-sm w-full" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Θέμα…" />
        </div>
      )}
      <div>
        <label className="text-xs text-gray-500 mb-0.5 block">Κείμενο *</label>
        <textarea className="input text-sm w-full resize-y" rows={4} value={body} onChange={e => setBody(e.target.value)} placeholder="Κείμενο μηνύματος…" />
      </div>
      <div className="text-xs text-gray-400 bg-white border border-gray-100 rounded px-2 py-1.5">
        <span className="font-semibold">Μεταβλητές:</span> {VARS_HINT}
      </div>
      <div className="flex gap-2">
        <button onClick={() => valid && onSave({ name: name.trim(), type, subject: subject.trim(), body: body.trim() })}
          disabled={!valid}
          className="btn-primary text-sm px-4">Αποθήκευση</button>
        <button onClick={onCancel} className="btn-secondary text-sm px-3">Άκυρο</button>
      </div>
    </div>
  )
}

function LinkForm({ initial, onSave, onCancel }) {
  const [label, setLabel] = useState(initial?.label || '')
  const [url, setUrl] = useState(initial?.url || '')
  const [autoFill, setAutoFill] = useState(initial?.auto_fill ?? false)

  const valid = label.trim() && url.trim()

  return (
    <div className="border border-blue-200 rounded-xl p-4 bg-blue-50 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 mb-0.5 block">Ετικέτα *</label>
          <input className="input text-sm w-full" value={label} onChange={e => setLabel(e.target.value)} placeholder="π.χ. TaxisNet Login" />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-0.5 block">URL *</label>
          <input className="input text-sm w-full" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
        <input type="checkbox" checked={autoFill} onChange={e => setAutoFill(e.target.checked)}
          className="rounded border-gray-300 text-blue-600" />
        <span className="text-gray-700">Προσθήκη ΑΦΜ/username στο URL (auto-fill)</span>
      </label>
      <div className="flex gap-2">
        <button onClick={() => valid && onSave({ label: label.trim(), url: url.trim(), auto_fill: autoFill })}
          disabled={!valid}
          className="btn-primary text-sm px-4">Αποθήκευση</button>
        <button onClick={onCancel} className="btn-secondary text-sm px-3">Άκυρο</button>
      </div>
    </div>
  )
}

export default function LeadLists() {
  const [templates, setTemplates] = useState([])
  const [links, setLinks] = useState([])
  const [addingTpl, setAddingTpl] = useState(false)
  const [editingTpl, setEditingTpl] = useState(null) // index
  const [addingLink, setAddingLink] = useState(false)
  const [editingLink, setEditingLink] = useState(null) // index
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    api.getLeadTemplates().then(r => setTemplates(r.data || [])).catch(() => {})
    api.getLeadLinks().then(r => setLinks(r.data || [])).catch(() => {})
  }, [])

  const handleSync = async (full = false) => {
    setSyncing(true)
    try {
      const res = await api.syncLeads(full)
      const d = res.data
      toast.success(`Sync OK (${d.mode}) — ${d.inserted} νέα${d.updated ? `, ${d.updated} ενημ.` : ''}`)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Σφάλμα sync')
    } finally { setSyncing(false) }
  }

  const handleNormalize = async () => {
    setSyncing(true)
    try {
      const res = await api.normalizeLeadStatuses()
      toast.success(`Fix Status OK — ${res.data.fixed} εγγραφές διορθώθηκαν`)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Σφάλμα')
    } finally { setSyncing(false) }
  }

  const saveTpls = async (next) => {
    setSaving(true)
    try {
      await api.putLeadTemplates(next)
      setTemplates(next)
      toast.success('Templates αποθηκεύτηκαν')
    } catch { toast.error('Σφάλμα') }
    finally { setSaving(false) }
  }

  const saveLinks = async (next) => {
    setSaving(true)
    try {
      await api.putLeadLinks(next)
      setLinks(next)
      toast.success('Links αποθηκεύτηκαν')
    } catch { toast.error('Σφάλμα') }
    finally { setSaving(false) }
  }

  const addTpl = (tpl) => { saveTpls([...templates, tpl]); setAddingTpl(false) }
  const updateTpl = (i, tpl) => { const n = [...templates]; n[i] = tpl; saveTpls(n); setEditingTpl(null) }
  const deleteTpl = (i) => { if (window.confirm('Διαγραφή template;')) saveTpls(templates.filter((_, idx) => idx !== i)) }

  const addLink = (link) => { saveLinks([...links, link]); setAddingLink(false) }
  const updateLink = (i, link) => { const n = [...links]; n[i] = link; saveLinks(n); setEditingLink(null) }
  const deleteLink = (i) => { if (window.confirm('Διαγραφή συνδέσμου;')) saveLinks(links.filter((_, idx) => idx !== i)) }

  const typeLabel = (t) => TEMPLATE_TYPES.find(x => x.value === t)?.label ?? t

  return (
    <div className="p-4 md:p-6 max-w-[900px] mx-auto space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black text-blue-800">Λίστες & Ρυθμίσεις</h1>
          <p className="text-gray-500 text-sm mt-0.5">Templates επικοινωνίας, σύνδεσμοι TaxisNet και συγχρονισμός</p>
        </div>
      </div>

      {/* Sync section */}
      <section className="card p-4">
        <h2 className="text-base font-bold text-gray-800 mb-3">Συγχρονισμός Google Sheet</h2>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => handleSync(false)} disabled={syncing}
            className="btn-secondary flex items-center gap-2 text-sm"
            title="Εισάγει μόνο νέες γραμμές">
            <ArrowPathIcon className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Φόρτωση…' : 'Sync (νέες γραμμές)'}
          </button>
          <button onClick={() => { if (window.confirm('Full sync: ανανεώνει ΟΛΑ τα sheet πεδία. Συνέχεια;')) handleSync(true) }}
            disabled={syncing}
            className="btn-secondary text-sm text-amber-700 border-amber-300 hover:bg-amber-50">
            Full Sync (όλα τα πεδία)
          </button>
          <button onClick={handleNormalize} disabled={syncing}
            className="btn-secondary text-sm text-violet-700 border-violet-200 hover:bg-violet-50"
            title="Διορθώνει status (CANCEL-INTEREST → Cancelled) σε υπάρχουσες εγγραφές">
            Fix Status
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">Αυτόματο sync κάθε μέρα στις 07:45 πρωί.</p>
      </section>

      {/* Templates */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-gray-800">Templates Επικοινωνίας</h2>
          {!addingTpl && (
            <button onClick={() => { setAddingTpl(true); setEditingTpl(null) }}
              className="btn-primary text-sm flex items-center gap-1.5">
              <PlusIcon className="w-4 h-4" /> Νέο Template
            </button>
          )}
        </div>

        {addingTpl && (
          <div className="mb-4">
            <TemplateForm onSave={addTpl} onCancel={() => setAddingTpl(false)} />
          </div>
        )}

        {templates.length === 0 && !addingTpl && (
          <div className="text-sm text-gray-400 py-6 text-center border border-dashed border-gray-200 rounded-xl">
            Δεν υπάρχουν templates. Δημιουργήστε το πρώτο σας.
          </div>
        )}

        <div className="space-y-2">
          {templates.map((tpl, i) => (
            <div key={i}>
              {editingTpl === i ? (
                <TemplateForm initial={tpl} onSave={(t) => updateTpl(i, t)} onCancel={() => setEditingTpl(null)} />
              ) : (
                <div className="flex items-start gap-3 p-3 bg-white border border-gray-200 rounded-xl hover:border-gray-300">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-semibold text-sm text-gray-800">{tpl.name}</span>
                      <span className="text-xs text-gray-400">{typeLabel(tpl.type)}</span>
                    </div>
                    {tpl.subject && <div className="text-xs text-gray-500 mb-0.5">Θέμα: {tpl.subject}</div>}
                    <p className="text-xs text-gray-600 line-clamp-2 whitespace-pre-wrap">{tpl.body}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => { setEditingTpl(i); setAddingTpl(false) }}
                      className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-600">Επεξ.</button>
                    <button onClick={() => deleteTpl(i)}
                      className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500">
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* TaxisNet links */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Σύνδεσμοι TaxisNet</h2>
            <p className="text-xs text-gray-400">Εμφανίζονται στην καρτέλα TaxisNet κάθε lead</p>
          </div>
          {!addingLink && (
            <button onClick={() => { setAddingLink(true); setEditingLink(null) }}
              className="btn-primary text-sm flex items-center gap-1.5">
              <PlusIcon className="w-4 h-4" /> Νέος Σύνδεσμος
            </button>
          )}
        </div>

        {addingLink && (
          <div className="mb-4">
            <LinkForm onSave={addLink} onCancel={() => setAddingLink(false)} />
          </div>
        )}

        {links.length === 0 && !addingLink && (
          <div className="text-sm text-gray-400 py-6 text-center border border-dashed border-gray-200 rounded-xl">
            Δεν υπάρχουν σύνδεσμοι. Προσθέστε πρώτα έναν.
          </div>
        )}

        <div className="space-y-2">
          {links.map((link, i) => (
            <div key={i}>
              {editingLink === i ? (
                <LinkForm initial={link} onSave={(l) => updateLink(i, l)} onCancel={() => setEditingLink(null)} />
              ) : (
                <div className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-xl hover:border-gray-300">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-gray-800">{link.label}</span>
                      {link.auto_fill && <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">auto-fill ΑΦΜ</span>}
                    </div>
                    <a href={link.url} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-blue-500 hover:underline truncate block">{link.url}</a>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => { setEditingLink(i); setAddingLink(false) }}
                      className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-600">Επεξ.</button>
                    <button onClick={() => deleteLink(i)}
                      className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500">
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
