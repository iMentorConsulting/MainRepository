import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import {
  getLeads, getLeadFilterOptions, getLead, createLead, updateLead, deleteLead,
  getLeadComments, addLeadComment, editLeadComment, deleteLeadComment,
  sendLeadMessage, convertLeadToCase, startLeadErmis, getLeadDuplicates, mergeLeads,
} from '../api'
import {
  MagnifyingGlassIcon, PlusIcon, TrashIcon, ChevronDownIcon, ChevronUpIcon, ChevronRightIcon,
  ChatBubbleLeftRightIcon, SparklesIcon, ArrowRightCircleIcon, PaperAirplaneIcon,
  PhoneIcon, EnvelopeIcon, PencilIcon, CheckIcon, DocumentTextIcon, ExclamationTriangleIcon,
  EyeIcon, EyeSlashIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

export const LEAD_STATUSES = ['NEW LEAD', 'CALL', 'HOT', 'ACTIVE', 'DEAL', 'CANCEL']

const STATUS_BADGE = {
  'NEW LEAD': 'bg-yellow-100 text-yellow-800',
  'CALL': 'bg-blue-100 text-blue-800',
  'HOT': 'bg-red-100 text-red-700',
  'ACTIVE': 'bg-amber-100 text-amber-800',
  'DEAL': 'bg-green-100 text-green-800',
  'CANCEL': 'bg-gray-200 text-gray-600',
}
const STATUS_ROW = {
  'NEW LEAD': 'bg-yellow-50/40', 'CALL': 'bg-blue-50/40', 'HOT': 'bg-red-50/40',
  'ACTIVE': 'bg-amber-50/30', 'DEAL': 'bg-green-50/40', 'CANCEL': 'bg-gray-50/60',
}
const ERMIS_BADGE = { starting: 'bg-amber-100 text-amber-700', in_progress: 'bg-indigo-100 text-indigo-700', eligible: 'bg-green-100 text-green-700', ineligible: 'bg-gray-100 text-gray-500', error: 'bg-red-100 text-red-700' }
const REMINDERS = [
  { key: 'overdue', label: 'Ληξιπρόθεσμα', dot: 'bg-red-500' },
  { key: 'today', label: 'Σήμερα', dot: 'bg-yellow-400' },
  { key: 'week', label: 'Εβδομάδα', dot: 'bg-orange-400' },
  { key: 'none', label: 'Χωρίς reminder', dot: 'bg-gray-300' },
]
const COLORS = ['#DC2626', '#EA580C', '#2563EB', '#16A34A', '#7C3AED']

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}
function nextCallClass(dateStr) {
  if (!dateStr) return 'text-gray-300 border-gray-200'
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0)
  const diff = Math.round((d - today) / 86400000)
  if (diff < 0) return 'bg-red-50 text-red-700 border-red-200'
  if (diff === 0) return 'bg-orange-50 text-orange-700 border-orange-200'
  return 'bg-green-50 text-green-700 border-green-200'
}
function stripMarkup(s) {
  if (!s) return ''
  return String(s).replace(/\[c=#[0-9a-fA-F]{3,6}\]/g, '').replace(/\[\/c\]/g, '').replace(/\*\*/g, '')
}
// Render **bold** and [c=#hex]…[/c] safely
function renderMarkup(text) {
  if (!text) return null
  const nodes = []; let key = 0
  const colorRe = /\[c=(#[0-9a-fA-F]{3,6})\]([\s\S]*?)\[\/c\]/g
  let last = 0, m
  const pushBold = (str, color) => {
    String(str).split(/(\*\*[\s\S]*?\*\*)/g).forEach(p => {
      if (!p) return
      if (p.startsWith('**') && p.endsWith('**')) nodes.push(<strong key={key++} style={color ? { color } : undefined}>{p.slice(2, -2)}</strong>)
      else nodes.push(<span key={key++} style={color ? { color } : undefined}>{p}</span>)
    })
  }
  while ((m = colorRe.exec(text)) !== null) {
    if (m.index > last) pushBold(text.slice(last, m.index), null)
    pushBold(m[2], m[1]); last = m.index + m[0].length
  }
  if (last < text.length) pushBold(text.slice(last), null)
  return nodes
}
const gmailUrl = (email) => `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}`

// Compact eligibility: green matched-program chips, red if ineligible, else status/—
function eligibilityCell(lead) {
  const mp = lead.matched_programs || []
  if (mp.length > 0) {
    return (
      <div className="flex flex-wrap gap-1">
        {mp.map((p, i) => (
          <span key={i} className="text-[10px] font-semibold bg-green-100 text-green-700 rounded-full px-2 py-0.5" title={p.status || ''}>{p.title}</span>
        ))}
      </div>
    )
  }
  if (lead.ermis_status === 'ineligible') {
    return <span className="text-xs font-semibold text-red-700 bg-red-100 rounded-full px-2 py-0.5">Μη επιλέξιμος</span>
  }
  if (lead.ermis_status === 'starting' || lead.ermis_status === 'in_progress') {
    return <span className="text-xs text-gray-400">σε εξέλιξη…</span>
  }
  return <span className="text-gray-300 text-xs">—</span>
}

function EditableCell({ value, onSave, type = 'text', className = '', placeholder = '—' }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value ?? '')
  useEffect(() => { setVal(value ?? '') }, [value])
  const commit = () => { setEditing(false); if ((val ?? '') !== (value ?? '')) onSave(val) }
  if (editing) return (
    <input autoFocus type={type} value={val} onChange={e => setVal(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setVal(value ?? ''); setEditing(false) } }}
      className={`w-full px-1 py-0.5 border border-blue-300 rounded text-sm ${className}`} />
  )
  return (
    <span onClick={() => setEditing(true)} className={`cursor-text hover:bg-blue-50 rounded px-1 py-0.5 block min-h-[1.4rem] ${className}`}>
      {value || <span className="text-gray-300">{placeholder}</span>}
    </span>
  )
}

function CommentComposer({ onSubmit }) {
  const [text, setText] = useState('')
  const ref = useRef(null)
  const wrap = (before, after) => {
    const el = ref.current
    if (!el) { setText(t => t + before + after); return }
    const s = el.selectionStart, e = el.selectionEnd, sel = text.slice(s, e)
    const nt = text.slice(0, s) + before + sel + after + text.slice(e)
    setText(nt)
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = s + before.length + sel.length + after.length })
  }
  const submit = () => { if (!text.trim()) return; onSubmit(text); setText('') }
  return (
    <div>
      <div className="flex items-center gap-1 mb-1">
        <button onClick={() => wrap('**', '**')} className="w-6 h-6 text-xs font-bold border rounded hover:bg-gray-100">B</button>
        {COLORS.map(c => <button key={c} onClick={() => wrap(`[c=${c}]`, '[/c]')} className="w-4 h-4 rounded-full border" style={{ background: c }} />)}
      </div>
      <div className="flex gap-2">
        <textarea ref={ref} value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit() }}
          rows={2} placeholder="Νέο σχόλιο… (Ctrl+Enter)" className="flex-1 text-sm border rounded-lg px-3 py-2" />
        <button onClick={submit} className="btn-primary text-sm self-end">OK</button>
      </div>
    </div>
  )
}

function SendModal({ lead, onClose }) {
  const [channel, setChannel] = useState('viber')
  const [message, setMessage] = useState('')
  const [subject, setSubject] = useState('i-Mentor Consulting')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true)
    try {
      const payload = channel === 'email' ? { notification_type: 'email', subject, body: message }
        : channel === 'both' ? { notification_type: 'both', message, subject, body: message }
          : { notification_type: 'viber', message }
      const res = await sendLeadMessage(lead.id, payload)
      const ok = (res.results || []).some(r => r.status === 'sent')
      ok ? toast.success('Το μήνυμα στάλθηκε') : toast.error('Δεν στάλθηκε')
      if (ok) onClose()
    } catch { toast.error('Σφάλμα αποστολής') } finally { setBusy(false) }
  }
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b font-bold">Αποστολή σε {lead.name || 'lead'}</div>
        <div className="p-4 space-y-3">
          <div className="flex gap-2">
            {['viber', 'email', 'both'].map(c => (
              <button key={c} onClick={() => setChannel(c)} className={`px-3 py-1.5 rounded-lg text-sm border ${channel === c ? 'bg-blue-500 text-white border-blue-500' : 'bg-white border-gray-300'}`}>
                {c === 'viber' ? 'Viber' : c === 'email' ? 'Email' : 'Και τα δύο'}
              </button>
            ))}
          </div>
          {channel !== 'viber' && <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Θέμα (email)" className="w-full px-3 py-2 border rounded-lg text-sm" />}
          <textarea value={message} onChange={e => setMessage(e.target.value)} rows={5} placeholder="Μήνυμα…" className="w-full px-3 py-2 border rounded-lg text-sm" />
        </div>
        <div className="p-4 border-t flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary text-sm">Άκυρο</button>
          <button onClick={submit} disabled={busy || !message} className="btn-primary text-sm flex items-center gap-1"><PaperAirplaneIcon className="w-4 h-4" />{busy ? '…' : 'Αποστολή'}</button>
        </div>
      </div>
    </div>
  )
}

function NewLeadModal({ options, onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', afm: '', program: '', total_amount: '', assigned_name: '' })
  const [sendErmis, setSendErmis] = useState(true)
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const submit = async () => {
    setBusy(true)
    try {
      await createLead({ ...form, total_amount: parseFloat(form.total_amount) || 0, send_ermis: sendErmis })
      toast.success('Το lead δημιουργήθηκε' + (sendErmis && form.afm ? ' — στάλθηκε στον ΕΡΜΗ' : ''))
      onCreated(); onClose()
    }
    catch { toast.error('Σφάλμα δημιουργίας') } finally { setBusy(false) }
  }
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b font-bold">Νέο Lead</div>
        <div className="p-4 grid grid-cols-2 gap-3">
          <input placeholder="Επωνυμία / Όνομα" value={form.name} onChange={e => set('name', e.target.value)} className="px-3 py-2 border rounded-lg text-sm col-span-2" />
          <input placeholder="Τηλέφωνο" value={form.phone} onChange={e => set('phone', e.target.value)} className="px-3 py-2 border rounded-lg text-sm" />
          <input placeholder="Email" value={form.email} onChange={e => set('email', e.target.value)} className="px-3 py-2 border rounded-lg text-sm" />
          <input placeholder="ΑΦΜ" value={form.afm} onChange={e => set('afm', e.target.value)} className="px-3 py-2 border rounded-lg text-sm" />
          <input placeholder="Ποσό (€)" value={form.total_amount} onChange={e => set('total_amount', e.target.value)} className="px-3 py-2 border rounded-lg text-sm" />
          <select value={form.program} onChange={e => set('program', e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
            <option value="">— Πρόγραμμα —</option>
            {(options.programs || ['ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ', 'ΔΥΠΑ', 'ΕΣΠΑ', 'ΑΝΑΚΑΙΝΙΖΩ']).map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <input placeholder="Σύμβουλος" value={form.assigned_name} onChange={e => set('assigned_name', e.target.value)} className="px-3 py-2 border rounded-lg text-sm" />
          <label className="col-span-2 flex items-center gap-2 text-sm text-gray-700 mt-1 cursor-pointer">
            <button type="button" onClick={() => setSendErmis(v => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${sendErmis ? 'bg-indigo-500' : 'bg-gray-300'}`}>
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${sendErmis ? 'translate-x-5' : 'translate-x-1'}`} />
            </button>
            <span className="flex items-center gap-1"><SparklesIcon className="w-4 h-4 text-indigo-500" />Αποστολή στον ΕΡΜΗ {form.afm ? '' : '(χρειάζεται ΑΦΜ)'}</span>
          </label>
        </div>
        <div className="p-4 border-t flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary text-sm">Άκυρο</button>
          <button onClick={submit} disabled={busy} className="btn-primary text-sm">{busy ? '…' : 'Δημιουργία'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Inline expanded detail (no separate page) ───────────────────────────────
function ExpandedRow({ lead, colSpan, onChanged, onConvert, onErmis, onSend }) {
  const [full, setFull] = useState(null)
  const [comments, setComments] = useState([])
  const [dups, setDups] = useState([])
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})

  const reload = useCallback(async () => {
    const l = await getLead(lead.id)
    setFull(l); setComments(l.comments || [])
    setForm({ name: l.name || '', afm: l.afm || '', program: l.program || '', service_type: l.service_type || '', source: l.source || '', total_amount: l.total_amount || '', email: l.email || '', phone: l.phone || '' })
  }, [lead.id])
  useEffect(() => { reload() }, [reload])
  const loadDups = useCallback(() => { getLeadDuplicates(lead.id).then(d => setDups(d.items || [])).catch(() => {}) }, [lead.id])
  useEffect(() => { loadDups() }, [loadDups])

  const doMerge = async (otherId) => {
    if (!confirm('Συγχώνευση αυτού του διπλότυπου στην τρέχουσα εγγραφή;\nΤα σχόλιά του θα μεταφερθούν και η διπλότυπη εγγραφή θα διαγραφεί.')) return
    try { await mergeLeads(lead.id, otherId); toast.success('Συγχωνεύθηκε'); await reload(); loadDups(); onChanged?.() }
    catch { toast.error('Σφάλμα συγχώνευσης') }
  }

  const addC = async (txt) => { try { await addLeadComment(lead.id, txt); setComments(await getLeadComments(lead.id)); onChanged?.() } catch { toast.error('Σφάλμα σχολίου') } }
  const delC = async (cid) => { if (!confirm('Διαγραφή σχολίου;')) return; try { await deleteLeadComment(lead.id, cid); setComments(cs => cs.filter(c => c.id !== cid)); onChanged?.() } catch { toast.error('Σφάλμα') } }
  const saveEdit = async () => { try { const l = await updateLead(lead.id, { ...form, total_amount: parseFloat(form.total_amount) || 0 }); setFull(l); setEditing(false); onChanged?.() } catch { toast.error('Σφάλμα') } }


  return (
    <tr className={STATUS_ROW[lead.status] || ''}>
      <td colSpan={colSpan} className="px-4 py-3 border-b">
        {/* Action bar */}
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <button onClick={() => onConvert(lead)} className="flex items-center gap-1 text-sm font-semibold bg-green-100 text-green-700 hover:bg-green-200 px-3 py-1.5 rounded-lg">
            <ArrowRightCircleIcon className="w-4 h-4" />Δημιουργία Υπόθεσης
          </button>
          <span className="text-sm text-gray-500">ΑΦΜ: <b className={full?.afm ? 'text-gray-700' : 'text-red-500'}>{full?.afm || '— (λείπει)'}</b></span>
          <span className="text-sm text-gray-500">Πρόγραμμα: <b className="text-gray-700">{full?.program || '—'}</b></span>
          <span className="text-sm text-gray-500">Referrer: <b className="text-gray-700">{full?.source || '—'}</b></span>
          {full?.portal_case_link && <a href={full.portal_case_link} target="_blank" rel="noreferrer" className="text-sm font-semibold text-blue-600 hover:underline">↗ Υπόθεση LOGISTIS #{full.portal_case_number}</a>}
          <button onClick={() => onErmis(lead)} className="flex items-center gap-1 text-sm bg-indigo-100 text-indigo-700 hover:bg-indigo-200 px-3 py-1.5 rounded-lg">
            <SparklesIcon className="w-4 h-4" />{full?.ermis_status ? 'Προβολή ΕΡΜΗΣ' : 'Έναρξη ΕΡΜΗΣ'}
          </button>
          <span className="flex items-center gap-1 text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg">
            <ChatBubbleLeftRightIcon className="w-4 h-4" />Σχόλια ({comments.length})
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <button onClick={() => onSend(lead)} className="flex items-center gap-1 text-sm border px-2.5 py-1 rounded-lg hover:bg-gray-50"><ChatBubbleLeftRightIcon className="w-4 h-4 text-purple-600" />Viber</button>
          {full?.email && <a href={gmailUrl(full.email)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sm border px-2.5 py-1 rounded-lg hover:bg-gray-50"><EnvelopeIcon className="w-4 h-4 text-red-500" />Email</a>}
          <a href="https://www1.aade.gr/taxisnet/mytaxisnet/protected/displayConsts.htm" target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sm border px-2.5 py-1 rounded-lg hover:bg-gray-50">TaxisNet</a>
          <button onClick={() => setEditing(e => !e)} className="flex items-center gap-1 text-sm border px-2.5 py-1 rounded-lg hover:bg-gray-50"><PencilIcon className="w-4 h-4 text-gray-500" />Επεξεργασία</button>
        </div>

        {editing && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3 bg-white border rounded-lg p-3">
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Επωνυμία" className="px-2 py-1.5 border rounded text-sm" />
            <input value={form.afm} onChange={e => setForm(f => ({ ...f, afm: e.target.value }))} placeholder="ΑΦΜ" className="px-2 py-1.5 border rounded text-sm" />
            <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="Τηλέφωνο" className="px-2 py-1.5 border rounded text-sm" />
            <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="Email" className="px-2 py-1.5 border rounded text-sm" />
            <select value={form.program} onChange={e => setForm(f => ({ ...f, program: e.target.value }))} className="px-2 py-1.5 border rounded text-sm">
              <option value="">— Πρόγραμμα —</option>
              {['ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ', 'ΔΥΠΑ', 'ΕΣΠΑ', 'ΑΝΑΚΑΙΝΙΖΩ'].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <input value={form.service_type} onChange={e => setForm(f => ({ ...f, service_type: e.target.value }))} placeholder="Υπηρεσία" className="px-2 py-1.5 border rounded text-sm" />
            <input value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} placeholder="Referrer / Πηγή" className="px-2 py-1.5 border rounded text-sm" />
            <input value={form.total_amount} onChange={e => setForm(f => ({ ...f, total_amount: e.target.value }))} placeholder="Ποσό" className="px-2 py-1.5 border rounded text-sm" />
            <button onClick={saveEdit} className="btn-primary text-sm flex items-center gap-1"><CheckIcon className="w-4 h-4" />Αποθήκευση</button>
          </div>
        )}

        {/* ΕΡΜΗΣ error (session-create failed) */}
        {full?.ermis_status === 'error' && full?.ermis_error && (
          <div className="mb-3 flex items-start gap-2 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <ExclamationTriangleIcon className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <div className="text-red-700"><b>Σφάλμα ΕΡΜΗΣ:</b> {full.ermis_error}</div>
          </div>
        )}

        {/* AADE business profile + program matching (from LOGISTIS/ΕΡΜΗΣ) */}
        {full?.business && (
          <div className="mb-3 bg-white border rounded-lg p-3">
            <div className="text-sm font-semibold text-gray-700 mb-1">Επιχείρηση (ΑΑΔΕ) — ΑΦΜ {full.business.afm}</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 text-xs text-gray-600">
              {full.business.onomasia && <div><span className="text-gray-400">Επωνυμία:</span> {full.business.onomasia}</div>}
              {full.business.regdate && <div><span className="text-gray-400">Ημ. έναρξης:</span> {full.business.regdate}</div>}
              {full.business.legalStatusDescr && <div><span className="text-gray-400">Μορφή:</span> {full.business.legalStatusDescr}</div>}
              {(full.business.postalAddress || full.business.postalAreaDescription) && (
                <div className="col-span-2 md:col-span-3"><span className="text-gray-400">Έδρα:</span> {[full.business.postalAddress, full.business.postalAddressNo, full.business.postalZipCode, full.business.postalAreaDescription].filter(Boolean).join(' ')}</div>
              )}
            </div>
            {full.business.activities?.length > 0 && (
              <div className="mt-2">
                <div className="text-xs text-gray-400 mb-0.5">ΚΑΔ:</div>
                <div className="flex flex-wrap gap-1">
                  {full.business.activities.map((a, i) => (
                    <span key={i} className="text-xs bg-gray-100 rounded px-2 py-0.5" title={a.firmActDescr}>{a.firmActCode} {a.firmActKind ? `(${a.firmActKind})` : ''}</span>
                  ))}
                </div>
              </div>
            )}
            {full.business.matchedPrograms?.length > 0 && (
              <div className="mt-2">
                <div className="text-xs text-gray-400 mb-0.5">Ταιριάζοντα προγράμματα:</div>
                <div className="flex flex-wrap gap-1">
                  {full.business.matchedPrograms.map((mp, i) => (
                    <span key={i} className="text-xs bg-green-100 text-green-700 rounded-full px-2 py-0.5">{mp.title}{mp.status ? ` · ${mp.status}` : ''}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ΕΡΜΗΣ transcript */}
        {full?.ermis_transcript && (
          <details className="mb-3 bg-indigo-50/40 border border-indigo-100 rounded-lg p-3">
            <summary className="text-sm font-semibold text-indigo-700 cursor-pointer flex items-center gap-1"><SparklesIcon className="w-4 h-4" />Συνομιλία ΕΡΜΗΣ {full.ermis_status ? `(${full.ermis_status})` : ''}</summary>
            <div className="mt-2 space-y-1 max-h-72 overflow-y-auto">
              {typeof full.ermis_transcript === 'string'
                ? <div className="text-sm whitespace-pre-wrap text-gray-700">{full.ermis_transcript}</div>
                : full.ermis_transcript.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-sm ${msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-white border text-gray-800'}`}>{msg.text || msg.content}</div>
                  </div>
                ))}
            </div>
          </details>
        )}

        {/* Program-specific questions (always shown for the program; answer or —) */}
        {full?.program_questions?.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {full.program_questions.map((q, i) => (
              <span key={q.key || i} className="text-xs bg-gray-100 rounded-full px-2.5 py-1">
                <b className="text-gray-600">{q.label}:</b> {q.answer != null && q.answer !== '' ? q.answer : <span className="text-gray-400">—</span>}
              </span>
            ))}
          </div>
        )}

        {/* Duplicate entries (same phone/email) */}
        {dups.length > 0 && (
          <div className="mb-3">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-amber-700 mb-1">
              <ExclamationTriangleIcon className="w-4 h-4" />{dups.length} άλλες εγγραφές με ίδιο τηλ/email
            </div>
            <div className="border border-amber-200 rounded-lg divide-y bg-amber-50/40">
              {dups.map(d => (
                <div key={d.id} className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-sm">
                  <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${STATUS_BADGE[d.status] || 'bg-gray-100'}`}>{d.status}</span>
                  <span className="font-medium text-gray-800">{d.name || '—'}</span>
                  {d.consultant && <span className="text-xs text-gray-400">({d.consultant})</span>}
                  {d.same_phone && <span className="flex items-center gap-0.5 text-xs text-gray-600"><PhoneIcon className="w-3 h-3 text-red-500" />ίδιο τηλ</span>}
                  {d.same_email && <span className="flex items-center gap-0.5 text-xs text-gray-600"><EnvelopeIcon className="w-3 h-3 text-gray-400" />ίδιο email</span>}
                  <span className="ml-auto text-xs text-gray-400">{fmtDate(d.created_at)}</span>
                  <button onClick={() => doMerge(d.id)} className="text-xs font-semibold text-orange-700 bg-orange-100 hover:bg-orange-200 px-2 py-0.5 rounded">Συγχώνευση</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sheet comment (Comments column) */}
        {full?.notes && (
          <div className="flex items-start gap-2 text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
            <DocumentTextIcon className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="whitespace-pre-wrap break-words text-gray-700">{renderMarkup(full.notes)}</div>
          </div>
        )}

        {/* Comment thread */}
        <div className="space-y-2 max-h-60 overflow-y-auto mb-2">
          {comments.map(c => (
            <div key={c.id} className="border rounded-lg p-2 bg-white">
              <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                <span>{c.author_name || '—'} · {c.created_at ? new Date(c.created_at).toLocaleString('el-GR') : ''}{c.edited ? ' (επεξ.)' : ''}</span>
                <button onClick={() => delC(c.id)} className="hover:text-red-500"><TrashIcon className="w-3.5 h-3.5" /></button>
              </div>
              <div className="text-sm text-gray-800 whitespace-pre-wrap break-words">{renderMarkup(c.content)}</div>
            </div>
          ))}
        </div>
        <CommentComposer onSubmit={addC} />
      </td>
    </tr>
  )
}

export default function Leads() {
  const [data, setData] = useState({ items: [], total: 0, page: 1, page_size: 50 })
  const [options, setOptions] = useState({ statuses: LEAD_STATUSES, agents: [], programs: [], consultants: [], status_counts: {}, total: 0 })
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ status: '', consultant: '', program: '', q: '', reminder: '', date_from: '', date_to: '' })
  const [sort, setSort] = useState({ sort: 'created_at', direction: 'desc' })
  const [page, setPage] = useState(1)
  const [showNew, setShowNew] = useState(false)
  const [sendLead, setSendLead] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [hideCancel, setHideCancel] = useState(true)   // CANCEL hidden by default

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = { ...sort, page }
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v })
      // Hide CANCEL by default, unless the user explicitly filtered to CANCEL
      if (hideCancel && filters.status !== 'CANCEL') params.exclude_status = 'CANCEL'
      setData(await getLeads(params))
    } catch { toast.error('Σφάλμα φόρτωσης leads') } finally { setLoading(false) }
  }, [filters, sort, page, hideCancel])
  const loadOptions = useCallback(() => { getLeadFilterOptions().then(setOptions).catch(() => {}) }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadOptions() }, [loadOptions])

  const patch = async (lead, field, value) => {
    try {
      await updateLead(lead.id, { [field]: value })
      setData(d => ({ ...d, items: d.items.map(l => l.id === lead.id ? { ...l, [field]: value } : l) }))
      if (field === 'status') loadOptions()
    } catch { toast.error('Σφάλμα αποθήκευσης') }
  }
  const toggleSort = (col) => setSort(s => s.sort === col ? { sort: col, direction: s.direction === 'asc' ? 'desc' : 'asc' } : { sort: col, direction: 'asc' })
  const setFilter = (patchObj) => { setPage(1); setFilters(f => ({ ...f, ...patchObj })) }

  const handleErmis = async (lead) => {
    if (lead.ermis_chat_url) { window.open(lead.ermis_chat_url, '_blank'); return }
    if (!confirm(`Έναρξη προαξιολόγησης ΕΡΜΗΣ και αποστολή link στον ${lead.name || 'lead'};`)) return
    const tid = toast.loading('Έναρξη ΕΡΜΗΣ…')
    try {
      await startLeadErmis(lead.id, { send_link: true, channel: 'both' })
      toast.success('Η έναρξη ΕΡΜΗΣ ξεκίνησε — το link θα σταλεί σε λίγο (Viber & Email)', { id: tid })
      // Give the background worker a moment, then refresh to show updated status
      setTimeout(load, 4000)
    } catch (e) {
      const msg = e.code === 'ECONNABORTED' ? 'Λήξη χρόνου — δοκιμάστε ξανά' : (e.response?.data?.detail || 'Σφάλμα ΕΡΜΗΣ')
      toast.error(msg, { id: tid })
    }
  }
  const handleConvert = async (lead) => {
    if (!confirm(`Δημιουργία υπόθεσης από το lead «${lead.name || ''}»;`)) return
    try { const res = await convertLeadToCase(lead.id); toast.success('Δημιουργήθηκε υπόθεση'); if (res.id) window.location.href = `/cases/${res.id}` }
    catch { toast.error('Σφάλμα μετατροπής') }
  }
  const handleDelete = async (lead) => {
    if (!confirm('Διαγραφή lead;')) return
    try { await deleteLead(lead.id); toast.success('Διαγράφηκε'); load(); loadOptions() } catch { toast.error('Σφάλμα διαγραφής') }
  }

  const SortTh = ({ col, children, className = '' }) => (
    <th onClick={() => toggleSort(col)} className={`px-2 py-2 text-left font-semibold text-gray-600 cursor-pointer select-none whitespace-nowrap ${className}`}>
      <span className="inline-flex items-center gap-1">{children}{sort.sort === col && (sort.direction === 'asc' ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />)}</span>
    </th>
  )

  const totalPages = Math.max(1, Math.ceil(data.total / (data.page_size || 50)))
  const counts = options.status_counts || {}
  const COLS = 12

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
          <div className="text-sm text-gray-500">{data.total} εγγραφές {options.total ? `(από ${options.total})` : ''}</div>
        </div>
        <button onClick={() => setShowNew(true)} className="btn-primary text-sm flex items-center gap-1"><PlusIcon className="w-4 h-4" />Νέο Lead</button>
      </div>

      {/* Status chips */}
      <div className="flex flex-wrap gap-2 mb-2">
        <button onClick={() => { setPage(1); setHideCancel(h => !h) }}
          className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border ${hideCancel ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-300'}`}
          title="Εναλλαγή εμφάνισης ακυρωμένων">
          {hideCancel ? <EyeSlashIcon className="w-3.5 h-3.5" /> : <EyeIcon className="w-3.5 h-3.5" />}
          Cancelled {hideCancel ? 'κρυφά' : 'ορατά'}
        </button>
        <button onClick={() => setFilter({ status: '' })} className={`px-3 py-1 rounded-full text-xs font-semibold border ${!filters.status ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-300'}`}>Όλα ({hideCancel ? Math.max(0, (options.total || 0) - (counts.CANCEL || 0)) : (options.total || 0)})</button>
        {LEAD_STATUSES.map(s => (
          <button key={s} onClick={() => setFilter({ status: filters.status === s ? '' : s })} className={`px-3 py-1 rounded-full text-xs font-semibold border ${filters.status === s ? 'ring-2 ring-offset-1 ring-blue-400 ' : ''}${STATUS_BADGE[s]} border-transparent`}>{s} ({counts[s] || 0})</button>
        ))}
      </div>
      {/* Reminder chips */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-xs text-gray-400">Reminder:</span>
        {REMINDERS.map(r => (
          <button key={r.key} onClick={() => setFilter({ reminder: filters.reminder === r.key ? '' : r.key })} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border ${filters.reminder === r.key ? 'bg-blue-50 border-blue-400 text-blue-700' : 'bg-white border-gray-300 text-gray-600'}`}>
            <span className={`w-2 h-2 rounded-full ${r.dot}`} />{r.label}
          </button>
        ))}
      </div>
      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-3">
        <div className="relative">
          <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 absolute left-2.5 top-2.5" />
          <input value={filters.q} onChange={e => setFilter({ q: e.target.value })} placeholder="Αναζήτηση…" className="pl-8 pr-3 py-2 border rounded-lg text-sm" />
        </div>
        <select value={filters.program} onChange={e => setFilter({ program: e.target.value })} className="px-3 py-2 border rounded-lg text-sm">
          <option value="">Όλα τα προγράμματα</option>{(options.programs || []).map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={filters.consultant} onChange={e => setFilter({ consultant: e.target.value })} className="px-3 py-2 border rounded-lg text-sm">
          <option value="">Σύμβουλος (όλοι)</option>{(options.consultants || []).map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="date" value={filters.date_from} onChange={e => setFilter({ date_from: e.target.value })} className="px-2 py-2 border rounded-lg text-sm" />
        <input type="date" value={filters.date_to} onChange={e => setFilter({ date_to: e.target.value })} className="px-2 py-2 border rounded-lg text-sm" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="w-8"></th>
              <SortTh col="status">STATUS</SortTh>
              <SortTh col="consultant">ΣΥΜΒΟΥΛΟΣ</SortTh>
              <th className="px-2 py-2 text-left font-semibold text-gray-600">ΠΡΟΓΡΑΜΜΑ</th>
              <SortTh col="name">ΕΠΩΝΥΜΙΑ</SortTh>
              <th className="px-2 py-2 text-left font-semibold text-gray-600">ΤΗΛ / EMAIL</th>
              <SortTh col="next_call_date">REMINDER</SortTh>
              <SortTh col="created_at">ΗΜ/ΝΙΑ</SortTh>
              <th className="px-2 py-2 text-left font-semibold text-gray-600">ΤΕΛΕΥΤΑΙΟ ΣΧΟΛΙΟ</th>
              <th className="px-2 py-2 text-left font-semibold text-gray-600">ΕΡΜΗΣ</th>
              <th className="px-2 py-2 text-left font-semibold text-gray-600">ΕΠΙΛΕΞΙΜΟΤΗΤΑ</th>
              <th className="px-2 py-2 text-right font-semibold text-gray-600">Ενέργειες</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={COLS} className="text-center py-10 text-gray-400">Φόρτωση…</td></tr>
            ) : data.items.length === 0 ? (
              <tr><td colSpan={COLS} className="text-center py-10 text-gray-400">Δεν βρέθηκαν leads</td></tr>
            ) : data.items.map(lead => {
              const isOpen = expandedId === lead.id
              const commentPreview = lead.last_comment?.content || lead.notes
              return (
                <Fragment key={lead.id}>
                  <tr className={`border-b hover:bg-blue-50/30 align-top ${STATUS_ROW[lead.status] || ''}`}>
                    <td className="pl-2 py-1.5">
                      <button onClick={() => setExpandedId(isOpen ? null : lead.id)} className="p-1 text-gray-400 hover:text-gray-700">
                        {isOpen ? <ChevronDownIcon className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />}
                      </button>
                    </td>
                    <td className="px-2 py-1.5">
                      <select value={lead.status} onChange={e => patch(lead, 'status', e.target.value)} className={`text-xs font-semibold rounded-full px-2 py-1 border-0 cursor-pointer ${STATUS_BADGE[lead.status] || 'bg-gray-100'}`}>
                        {LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1.5 w-28"><EditableCell value={lead.consultant} onSave={v => patch(lead, 'assigned_name', v)} /></td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-xs text-gray-600" title={lead.program_title || ''}>{lead.program || lead.program_title || <span className="text-gray-300">—</span>}</td>
                    <td className="px-2 py-1.5 min-w-[150px]">
                      <div className="text-blue-600 hover:underline cursor-pointer font-medium" onClick={() => setExpandedId(isOpen ? null : lead.id)}>{lead.name || '—'}</div>
                      {lead.afm && <div className="text-[11px] text-gray-400">ΑΦΜ {lead.afm}</div>}
                    </td>
                    <td className="px-2 py-1.5 min-w-[160px]">
                      {lead.phone && <a href={`tel:${lead.phone}`} className="flex items-center gap-1 text-gray-700 hover:text-blue-600"><PhoneIcon className="w-3.5 h-3.5 text-gray-400" />{lead.phone}</a>}
                      {lead.email && <a href={gmailUrl(lead.email)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-gray-500 text-xs hover:text-blue-600 truncate max-w-[180px]"><EnvelopeIcon className="w-3.5 h-3.5 text-gray-400" />{lead.email}</a>}
                      {!lead.phone && !lead.email && <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      <input type="date" value={lead.next_call_date || ''} onChange={e => patch(lead, 'next_call_date', e.target.value || null)} className={`text-xs rounded px-1.5 py-1 border ${nextCallClass(lead.next_call_date)}`} />
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-gray-500 text-xs">{fmtDate(lead.created_at)}</td>
                    <td className="px-2 py-1.5 max-w-[220px]">
                      {commentPreview ? <div className="text-xs text-gray-600 truncate" title={stripMarkup(commentPreview)}>{stripMarkup(commentPreview)}</div> : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-2 py-1.5">
                      {lead.ermis_status ? <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${ERMIS_BADGE[lead.ermis_status] || 'bg-gray-100'}`} title={lead.ermis_status === 'error' ? (lead.ermis_error || 'Σφάλμα') : ''}>{lead.ermis_status}</span> : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-2 py-1.5 max-w-[220px]">{eligibilityCell(lead)}</td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center justify-end gap-1">
                        <button title="Μήνυμα" onClick={() => setSendLead(lead)} className="p-1.5 rounded hover:bg-blue-100 text-blue-600"><ChatBubbleLeftRightIcon className="w-4 h-4" /></button>
                        <button title="Διαγραφή" onClick={() => handleDelete(lead)} className="p-1.5 rounded hover:bg-red-100 text-red-500"><TrashIcon className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                  {isOpen && <ExpandedRow lead={lead} colSpan={COLS} onChanged={load} onConvert={handleConvert} onErmis={handleErmis} onSend={setSendLead} />}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-3 text-sm text-gray-600">
        <div>Σελίδα {data.page} / {totalPages}</div>
        <div className="flex items-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-secondary text-sm disabled:opacity-40">Προηγ.</button>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="btn-secondary text-sm disabled:opacity-40">Επόμ.</button>
        </div>
      </div>

      {showNew && <NewLeadModal options={options} onClose={() => setShowNew(false)} onCreated={() => { load(); loadOptions() }} />}
      {sendLead && <SendModal lead={sendLead} onClose={() => setSendLead(null)} />}
    </div>
  )
}
