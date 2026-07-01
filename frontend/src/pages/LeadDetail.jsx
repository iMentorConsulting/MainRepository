import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  getLead, updateLead, getLeadComments, addLeadComment, editLeadComment, deleteLeadComment,
  getLeadErmisTranscript, startLeadErmis, convertLeadToCase,
} from '../api'
import {
  ArrowLeftIcon, SparklesIcon, ArrowRightCircleIcon, TrashIcon, PencilIcon, CheckIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { LEAD_STATUSES } from './Leads'

// Render **bold** and [c=#hex]text[/c] markup safely (no dangerouslySetInnerHTML).
function renderMarkup(text) {
  if (!text) return null
  const nodes = []
  let key = 0
  // Split on color spans first
  const colorRe = /\[c=(#[0-9a-fA-F]{3,6})\]([\s\S]*?)\[\/c\]/g
  let last = 0, m
  const pushBold = (str, color) => {
    const parts = str.split(/(\*\*[\s\S]*?\*\*)/g)
    parts.forEach(p => {
      if (!p) return
      if (p.startsWith('**') && p.endsWith('**')) {
        nodes.push(<strong key={key++} style={color ? { color } : undefined}>{p.slice(2, -2)}</strong>)
      } else {
        nodes.push(<span key={key++} style={color ? { color } : undefined}>{p}</span>)
      }
    })
  }
  while ((m = colorRe.exec(text)) !== null) {
    if (m.index > last) pushBold(text.slice(last, m.index), null)
    pushBold(m[2], m[1])
    last = m.index + m[0].length
  }
  if (last < text.length) pushBold(text.slice(last), null)
  return nodes
}

function Field({ label, children }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-sm text-gray-900">{children}</div>
    </div>
  )
}

export default function LeadDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [lead, setLead] = useState(null)
  const [comments, setComments] = useState([])
  const [transcript, setTranscript] = useState(null)
  const [newComment, setNewComment] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')

  const load = useCallback(async () => {
    try {
      const l = await getLead(id)
      setLead(l)
      setComments(l.comments || [])
    } catch { toast.error('Σφάλμα φόρτωσης') }
  }, [id])

  useEffect(() => { load() }, [load])
  useEffect(() => { getLeadErmisTranscript(id).then(setTranscript).catch(() => {}) }, [id])

  const patch = async (field, value) => {
    try { const l = await updateLead(id, { [field]: value }); setLead(l) } catch { toast.error('Σφάλμα') }
  }

  const submitComment = async () => {
    if (!newComment.trim()) return
    try { await addLeadComment(id, newComment); setNewComment(''); const c = await getLeadComments(id); setComments(c) }
    catch { toast.error('Σφάλμα σχολίου') }
  }
  const saveEdit = async (cid) => {
    try { await editLeadComment(id, cid, editText); setEditingId(null); const c = await getLeadComments(id); setComments(c) }
    catch { toast.error('Σφάλμα') }
  }
  const removeComment = async (cid) => {
    if (!confirm('Διαγραφή σχολίου;')) return
    try { await deleteLeadComment(id, cid); setComments(cs => cs.filter(c => c.id !== cid)) } catch { toast.error('Σφάλμα') }
  }

  const handleErmis = async () => {
    if (!confirm('Έναρξη προαξιολόγησης ΕΡΜΗΣ και αποστολή link;')) return
    try { await startLeadErmis(id, { send_link: true, channel: lead.phone ? 'viber' : 'email' }); toast.success('Ξεκίνησε ΕΡΜΗΣ'); load(); getLeadErmisTranscript(id).then(setTranscript) }
    catch (e) { toast.error(e.response?.data?.detail || 'Σφάλμα ΕΡΜΗΣ') }
  }
  const handleConvert = async () => {
    if (!confirm('Μετατροπή σε υπόθεση;')) return
    try { const res = await convertLeadToCase(id); toast.success('Δημιουργήθηκε υπόθεση'); if (res.id) navigate(`/cases/${res.id}`) }
    catch { toast.error('Σφάλμα μετατροπής') }
  }

  if (!lead) return <div className="p-6 text-gray-400">Φόρτωση…</div>

  const tr = transcript?.transcript

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <button onClick={() => navigate('/leads')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-3">
        <ArrowLeftIcon className="w-4 h-4" />Πίσω στα Leads
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold">{lead.name || 'Lead'} <span className="text-gray-400 text-lg">#{lead.id}</span></h1>
        <div className="flex gap-2">
          <button onClick={handleErmis} className="btn-secondary text-sm flex items-center gap-1"><SparklesIcon className="w-4 h-4" />Έναρξη ΕΡΜΗΣ</button>
          {lead.linked_case_id
            ? <button onClick={() => navigate(`/cases/${lead.linked_case_id}`)} className="btn-secondary text-sm">Υπόθεση #{lead.linked_case_id}</button>
            : <button onClick={handleConvert} className="btn-primary text-sm flex items-center gap-1"><ArrowRightCircleIcon className="w-4 h-4" />Μετατροπή σε υπόθεση</button>}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {/* Lead info */}
        <div className="bg-white rounded-xl border shadow-sm p-4 space-y-3 md:col-span-1">
          <div className="font-semibold text-gray-700 mb-1">Στοιχεία</div>
          <Field label="Status">
            <select value={lead.status} onChange={e => patch('status', e.target.value)} className="text-sm border rounded px-2 py-1">
              {LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Τηλέφωνο">{lead.phone || '—'}{lead.phone2 ? ` / ${lead.phone2}` : ''}</Field>
          <Field label="Email">{lead.email || '—'}</Field>
          <Field label="ΑΦΜ">{lead.afm || '—'}</Field>
          <Field label="Πρόγραμμα">{lead.program || '—'}</Field>
          <Field label="Ποσό">{lead.total_amount ? `${lead.total_amount} €` : '—'}</Field>
          <Field label="Σύμβουλος">
            <input value={lead.assigned_name || ''} onChange={e => patch('assigned_name', e.target.value)}
              placeholder="—" className="text-sm border rounded px-2 py-1 w-full" />
          </Field>
          <Field label="Πηγή">{lead.source || '—'}</Field>
          <Field label="Επόμενη κλήση">
            <input type="date" value={lead.next_call_date || ''} onChange={e => patch('next_call_date', e.target.value || null)} className="text-sm border rounded px-2 py-1" />
          </Field>
          {lead.program_fields && Object.keys(lead.program_fields).length > 0 && (
            <div>
              <div className="text-xs text-gray-500 mb-1">Ειδικά πεδία προγράμματος</div>
              <div className="space-y-1">
                {Object.entries(lead.program_fields).map(([k, v]) => (
                  <div key={k} className="text-sm"><span className="text-gray-500">{v?.label || k}:</span> {v?.value ?? String(v)}</div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Comments */}
        <div className="bg-white rounded-xl border shadow-sm p-4 md:col-span-2">
          <div className="font-semibold text-gray-700 mb-2">Σχόλια</div>
          <div className="space-y-2 max-h-72 overflow-y-auto mb-3">
            {comments.length === 0 && <div className="text-sm text-gray-400">Δεν υπάρχουν σχόλια</div>}
            {comments.map(c => (
              <div key={c.id} className="border rounded-lg p-2 bg-gray-50">
                <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                  <span>{c.author_name || '—'} · {c.created_at ? new Date(c.created_at).toLocaleString('el-GR') : ''}{c.edited ? ' (επεξεργασμένο)' : ''}</span>
                  <span className="flex gap-1">
                    <button onClick={() => { setEditingId(c.id); setEditText(c.content) }} className="hover:text-gray-700"><PencilIcon className="w-3.5 h-3.5" /></button>
                    <button onClick={() => removeComment(c.id)} className="hover:text-red-500"><TrashIcon className="w-3.5 h-3.5" /></button>
                  </span>
                </div>
                {editingId === c.id ? (
                  <div className="flex gap-1">
                    <input value={editText} onChange={e => setEditText(e.target.value)} className="flex-1 text-sm border rounded px-2 py-1" />
                    <button onClick={() => saveEdit(c.id)} className="p-1 text-green-600"><CheckIcon className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <div className="text-sm text-gray-800 whitespace-pre-wrap break-words">{renderMarkup(c.content)}</div>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={newComment} onChange={e => setNewComment(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submitComment() }}
              placeholder="Προσθήκη σχολίου… (**έντονα**, [c=#FF0000]χρώμα[/c])"
              className="flex-1 text-sm border rounded-lg px-3 py-2" />
            <button onClick={submitComment} className="btn-primary text-sm">Προσθήκη</button>
          </div>
        </div>
      </div>

      {/* ΕΡΜΗΣ transcript */}
      <div className="bg-white rounded-xl border shadow-sm p-4 mt-4">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold text-gray-700 flex items-center gap-2"><SparklesIcon className="w-4 h-4 text-indigo-500" />Συνομιλία ΕΡΜΗΣ</div>
          {transcript?.ermis_status && <span className="text-xs font-semibold rounded-full px-2 py-0.5 bg-indigo-100 text-indigo-700">{transcript.ermis_status}</span>}
        </div>
        {!tr ? (
          <div className="text-sm text-gray-400">Δεν υπάρχει ακόμη συνομιλία. {transcript?.chat_url && <a href={transcript.chat_url} target="_blank" rel="noreferrer" className="text-blue-600 underline">Άνοιγμα link</a>}</div>
        ) : typeof tr === 'string' ? (
          <div className="text-sm whitespace-pre-wrap text-gray-800">{tr}</div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {tr.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-800'}`}>
                  {msg.text || msg.content}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
