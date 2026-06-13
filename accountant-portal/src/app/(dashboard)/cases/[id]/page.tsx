'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MultiSelect } from '@/components/ui/multi-select'
import { QuickSendModal } from '@/components/quick-send-modal'
import { formatDateTime } from '@/lib/utils'
import {
  ClipboardList, User, Building2, CheckCircle2, MessageSquare, Lock, Send,
  Mail, Phone, MapPin, Calendar, Target, FileDown, Paperclip, Plus, Trash2, ListChecks, Server, X, ExternalLink,
} from 'lucide-react'

const STATUS_LABELS: Record<string, string> = {
  NEW: 'Νέο', ACCEPTED: 'Αποδεκτό', IN_PROGRESS: 'Σε Εξέλιξη',
  WAITING_CLIENT: 'Αναμονή Πελάτη', WAITING_ACCOUNTANT: 'Αναμονή Λογιστή',
  COMPLETED: 'Ολοκληρωμένο', CANCELLED: 'Ακυρωμένο',
}
const STATUS_VARIANT: Record<string, any> = {
  NEW: 'info', ACCEPTED: 'purple', IN_PROGRESS: 'warning',
  WAITING_CLIENT: 'secondary', WAITING_ACCOUNTANT: 'secondary',
  COMPLETED: 'success', CANCELLED: 'danger',
}
const PRIORITY_LABELS: Record<string, string> = { LOW: 'Χαμηλή', NORMAL: 'Κανονική', HIGH: 'Υψηλή', URGENT: 'Επείγον' }
const TYPE_LABELS: Record<string, string> = {
  TAKE_OVER: 'Ανάληψη Πελάτη', CONTACT_CLIENT: 'Επικοινωνία με Πελάτη',
  APPLICATION_SUPPORT: 'Υποστήριξη Αίτησης', OTHER: 'Άλλο',
}
const ACTIVITY_DOT: Record<string, string> = {
  CREATED: 'bg-indigo-500', STATUS_CHANGE: 'bg-amber-500', ASSIGNMENT: 'bg-violet-500',
  NOTE: 'bg-slate-400', CONTACT_LOG: 'bg-emerald-500', DOCUMENT: 'bg-blue-500', EXTERNAL: 'bg-cyan-500',
}

export default function CaseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'ADMIN'
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [comment, setComment] = useState('')
  const [internal, setInternal] = useState(false)
  const [notifyAccountant, setNotifyAccountant] = useState(false)
  const [posting, setPosting] = useState(false)
  const [showQuickSend, setShowQuickSend] = useState(false)
  const [showContactAccountant, setShowContactAccountant] = useState(false)
  const [accountantMsg, setAccountantMsg] = useState('')
  const [sendingAccountantMsg, setSendingAccountantMsg] = useState(false)

  // Tasks
  const [newTask, setNewTask] = useState('')
  // Document request (admin)
  const [reqCategories, setReqCategories] = useState<string[]>([])
  const [reqNote, setReqNote] = useState('')
  const [requesting, setRequesting] = useState(false)
  // Document upload
  const [upCategory, setUpCategory] = useState('')
  const [upRequestId, setUpRequestId] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [docTypeOptions, setDocTypeOptions] = useState<{ id: string; label: string; active: boolean }[]>([])

  async function load() {
    const res = await fetch(`/api/cases/${id}`)
    if (res.ok) setData(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  useEffect(() => {
    fetch('/api/admin/case-document-types')
      .then(r => r.json())
      .then(d => setDocTypeOptions(Array.isArray(d) ? d.filter((t: any) => t.active) : []))
      .catch(() => {})
  }, [])

  async function handleDeleteCase() {
    if (!data) return
    if (!confirm(`Διαγραφή υπόθεσης #${data.case.caseNumber}; Η ενέργεια δεν αναιρείται.`)) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/cases/${id}`, { method: 'DELETE' })
      if (res.ok) {
        router.push('/cases')
      } else {
        alert('Σφάλμα διαγραφής')
      }
    } finally {
      setDeleting(false)
    }
  }

  async function updateCase(patch: any) {
    const res = await fetch(`/api/cases/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (res.ok) load()
  }

  async function postComment() {
    if (!comment.trim()) return
    setPosting(true)
    const res = await fetch(`/api/cases/${id}/activities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: comment, internal, notifyAccountant }),
    })
    if (res.ok) {
      setComment('')
      setInternal(false)
      setNotifyAccountant(false)
      load()
    }
    setPosting(false)
  }

  async function addTask() {
    if (!newTask.trim()) return
    const res = await fetch(`/api/cases/${id}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTask }),
    })
    if (res.ok) { setNewTask(''); load() }
  }

  async function toggleTask(task: any) {
    await fetch(`/api/cases/${id}/tasks`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: task.id, done: !task.done }),
    })
    load()
  }

  async function deleteTask(taskId: string) {
    await fetch(`/api/cases/${id}/tasks?taskId=${taskId}`, { method: 'DELETE' })
    load()
  }

  async function requestDocument() {
    if (reqCategories.length === 0) return
    setRequesting(true)
    try {
      await fetch(`/api/cases/${id}/document-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories: reqCategories, note: reqNote }),
      })
      setReqCategories([])
      setReqNote('')
      load()
    } finally {
      setRequesting(false)
    }
  }

  async function uploadDocument(file: File, category: string, requestId?: string) {
    if (file.size > 10 * 1024 * 1024) { alert('Μέγιστο μέγεθος αρχείου 10MB'); return }
    setUploading(true)
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
    const res = await fetch(`/api/cases/${id}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, fileName: file.name, dataUrl, requestId: requestId || undefined }),
    })
    if (res.ok) {
      setUpCategory('')
      setUpRequestId('')
      if (fileRef.current) fileRef.current.value = ''
      load()
    } else {
      const err = await res.json()
      alert(err.error || 'Σφάλμα')
    }
    setUploading(false)
  }

  async function sendAccountantMessage() {
    if (!accountantMsg.trim()) return
    setSendingAccountantMsg(true)
    try {
      const res = await fetch(`/api/cases/${id}/contact-accountant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: accountantMsg }),
      })
      if (res.ok) {
        setAccountantMsg('')
        setShowContactAccountant(false)
        load()
      } else {
        alert('Σφάλμα αποστολής')
      }
    } finally {
      setSendingAccountantMsg(false)
    }
  }

  async function downloadDocument(docId: string, fileName: string) {
    const res = await fetch(`/api/cases/${id}/documents?documentId=${docId}`)
    if (!res.ok) return
    const doc = await res.json()
    const a = document.createElement('a')
    a.href = doc.dataUrl
    a.download = fileName
    a.click()
  }

  if (loading) {
    return <div className="flex items-center justify-center h-48"><div className="animate-spin w-8 h-8 border-4 border-blue-800 border-t-transparent rounded-full" /></div>
  }
  if (!data) return <div className="text-center text-gray-400 py-12">Δεν βρέθηκε η υπόθεση</div>

  const c = data.case
  const b = c.business || {}
  const typeLabel = c.caseType || TYPE_LABELS[c.requestType] || c.requestType
  const matches = (b.programMatches || []).filter((m: any) => m.status !== 'REJECTED')
  const pendingRequests = (c.documentRequests || []).filter((r: any) => r.status === 'PENDING')
  const address = [b.postalAddress, b.postalAddressNo, b.postalZipCode, b.postalAreaDescription].filter(Boolean).join(' ')
  const tasksDone = (c.tasks || []).filter((t: any) => t.done).length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <ClipboardList size={14} />
            Υπόθεση #{c.caseNumber}
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{c.title}</h1>
          <div className="flex flex-wrap gap-2 mt-2">
            <Badge variant={STATUS_VARIANT[c.status]}>{STATUS_LABELS[c.status]}</Badge>
            <Badge variant="secondary">{PRIORITY_LABELS[c.priority]}</Badge>
            <Badge variant="secondary">{typeLabel}</Badge>
            {c.externalRef && <Badge variant="purple">Case Mgmt: {c.externalStatus || c.externalRef}</Badge>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowQuickSend(true)}>
            <Send size={14} className="mr-1.5" />
            Γρήγορη Επικοινωνία
          </Button>
          {isAdmin && (
            <Button variant="outline" onClick={() => setShowContactAccountant(true)}>
              <MessageSquare size={14} className="mr-1.5" />
              Επικοινωνία με Λογιστή
            </Button>
          )}
          {!isAdmin && c.status === 'NEW' && (
            <Button variant="outline" onClick={() => updateCase({ status: 'CANCELLED' })}>Ακύρωση Υπόθεσης</Button>
          )}
          {isAdmin && (
            <Button
              variant="outline"
              onClick={handleDeleteCase}
              loading={deleting}
              className="border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
            >
              <Trash2 size={15} className="mr-1.5" />
              Διαγραφή
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle>Στοιχεία Πελάτη & Υπόθεσης</CardTitle></CardHeader>
            <CardContent className="text-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2.5">
                <div className="flex items-center gap-2">
                  <Building2 size={14} className="text-gray-400 flex-shrink-0" />
                  <span className="text-gray-500">Επιχείρηση:</span>
                  <Link href={`/businesses/${b.id}`} className="font-medium text-blue-800 hover:underline truncate">{b.onomasia || b.afm}</Link>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">ΑΦΜ:</span>
                  <span className="font-medium">{b.afm}</span>
                  {b.doyDescr && <span className="text-gray-400">· ΔΟΥ {b.doyDescr}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <User size={14} className="text-gray-400 flex-shrink-0" />
                  <span className="text-gray-500">Λογιστής:</span>
                  <span className="font-medium">{c.accountant?.officeName}</span>
                </div>
                {b.regdate && (
                  <div className="flex items-center gap-2">
                    <Calendar size={14} className="text-gray-400 flex-shrink-0" />
                    <span className="text-gray-500">Έναρξη:</span>
                    <span className="font-medium">{b.regdate}</span>
                  </div>
                )}
                {b.legalStatusDescr && (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">Νομική μορφή:</span>
                    <span className="font-medium">{b.legalStatusDescr}</span>
                  </div>
                )}
                {b.firmFlagDescr && (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">Κατάσταση:</span>
                    <span className="font-medium">{b.deactivationFlagDescr || b.firmFlagDescr}</span>
                  </div>
                )}
                {address && (
                  <div className="flex items-center gap-2">
                    <MapPin size={14} className="text-gray-400 flex-shrink-0" />
                    <span className="font-medium truncate">{address}</span>
                  </div>
                )}
                {b.email && (
                  <div className="flex items-center gap-2">
                    <Mail size={14} className="text-gray-400 flex-shrink-0" />
                    <a href={`mailto:${b.email}`} className="font-medium text-blue-800 hover:underline truncate">{b.email}</a>
                  </div>
                )}
                {(b.phone || b.viberPhone) && (
                  <div className="flex items-center gap-2">
                    <Phone size={14} className="text-gray-400 flex-shrink-0" />
                    <span className="font-medium">{b.phone || b.viberPhone}</span>
                    {b.viberPhone && <Badge variant="purple">Viber: {b.viberPhone}</Badge>}
                  </div>
                )}
                {c.program && (
                  <div className="flex items-center gap-2">
                    <Target size={14} className="text-gray-400 flex-shrink-0" />
                    <span className="text-gray-500">Πρόγραμμα:</span>
                    <Link href={`/programs/${c.program.id}`} className="font-medium text-blue-800 hover:underline truncate">{c.program.title}</Link>
                  </div>
                )}
              </div>

              {c.description && (
                <div className="mt-4">
                  <div className="text-gray-500 mb-1">Πληροφορίες για τον πελάτη / την επιχείρηση</div>
                  <div className="bg-gray-50 rounded-lg p-3 whitespace-pre-wrap">{c.description}</div>
                </div>
              )}
              {c.outcome && (
                <div className="mt-4">
                  <div className="text-gray-500 mb-1">Αποτέλεσμα</div>
                  <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 whitespace-pre-wrap">{c.outcome}</div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Matches Πελάτη ({matches.length})</CardTitle></CardHeader>
            <CardContent>
              {matches.length === 0 ? (
                <p className="text-sm text-gray-400">Δεν υπάρχουν ενεργά matches</p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {matches.map((m: any) => (
                    <div key={m.id} className="flex items-center justify-between gap-3 py-2">
                      <Link href={`/programs/${m.program.id}`} className="text-sm font-medium text-blue-800 hover:underline truncate">
                        {m.program.title}
                      </Link>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {m.program.category && <Badge variant="secondary">{m.program.category}</Badge>}
                        <Badge variant={m.matchScore >= 80 ? 'success' : 'warning'}>{Math.round(m.matchScore)}%</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Paperclip size={16} />
                Έγγραφα ({(c.documents || []).length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {pendingRequests.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-amber-700 uppercase">Εκκρεμή αιτήματα εγγράφων</div>
                  {pendingRequests.map((r: any) => (
                    <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      <div className="text-sm">
                        <span className="font-medium text-amber-900">{r.category}</span>
                        {r.note && <span className="text-amber-700"> — {r.note}</span>}
                        <span className="text-xs text-amber-600 ml-2">{formatDateTime(r.createdAt)}</span>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => {
                          setUpCategory(r.category)
                          setUpRequestId(r.id)
                          fileRef.current?.click()
                        }}>
                          <Plus size={13} className="mr-1" />
                          Ανέβασμα
                        </Button>
                        {isAdmin && (
                          <button onClick={async () => {
                            await fetch(`/api/cases/${id}/document-requests?requestId=${r.id}`, { method: 'DELETE' })
                            load()
                          }} className="text-gray-400 hover:text-red-500">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {(c.documents || []).length > 0 && (
                <div className="divide-y divide-gray-50">
                  {c.documents.map((d: any) => (
                    <div key={d.id} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="info">{d.category}</Badge>
                          <span className="text-sm font-medium truncate">{d.fileName}</span>
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">{d.uploadedByName} · {formatDateTime(d.createdAt)}</div>
                      </div>
                      <button onClick={() => downloadDocument(d.id, d.fileName)} className="text-blue-700 hover:text-blue-900 flex-shrink-0" title="Λήψη">
                        <FileDown size={17} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Free upload */}
              <div className="pt-3 border-t border-gray-100 space-y-2">
                <div className="text-xs font-semibold text-gray-500 uppercase">Ανέβασμα εγγράφου</div>
                <div className="flex flex-wrap gap-2 items-center">
                  <select
                    value={upCategory}
                    onChange={e => { setUpCategory(e.target.value); setUpRequestId('') }}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Επιλέξτε κατηγορία...</option>
                    {docTypeOptions.map(t => <option key={t.id} value={t.label}>{t.label}</option>)}
                  </select>
                  <input
                    ref={fileRef}
                    type="file"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      if (!upCategory.trim()) { alert('Συμπληρώστε πρώτα την κατηγορία εγγράφου'); e.target.value = ''; return }
                      uploadDocument(file, upCategory.trim(), upRequestId || undefined)
                    }}
                  />
                  <Button size="sm" variant="outline" loading={uploading} onClick={() => {
                    if (!upCategory.trim()) { alert('Συμπληρώστε πρώτα την κατηγορία εγγράφου'); return }
                    setUpRequestId('')
                    fileRef.current?.click()
                  }}>
                    <Paperclip size={13} className="mr-1" />
                    Επιλογή αρχείου
                  </Button>
                </div>
              </div>

              {/* Admin: request a document from the accountant */}
              {isAdmin && (
                <div className="pt-3 border-t border-gray-100 space-y-2">
                  <div className="text-xs font-semibold text-gray-500 uppercase">Ζήτηση εγγράφου από τον λογιστή</div>
                  <div className="flex flex-wrap gap-2 items-end">
                    <MultiSelect
                      label="Κατηγορίες"
                      placeholder="Επιλέξτε κατηγορίες..."
                      options={docTypeOptions.map(t => ({ value: t.label, label: t.label }))}
                      selected={reqCategories}
                      onChange={setReqCategories}
                    />
                    <input
                      value={reqNote}
                      onChange={e => setReqNote(e.target.value)}
                      placeholder="Σημείωση (προαιρετικά)"
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 flex-1 min-w-[160px]"
                    />
                    <Button size="sm" loading={requesting} onClick={requestDocument}>Αποστολή Αιτήματος</Button>
                  </div>
                  <p className="text-xs text-gray-400">Ο λογιστής λαμβάνει ειδοποίηση και email με link για να ανεβάσει το έγγραφο.</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Ιστορικό</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-4">
                {c.activities.map((a: any, i: number) => (
                  <div key={a.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`w-2.5 h-2.5 rounded-full ${ACTIVITY_DOT[a.type] || 'bg-slate-400'}`} />
                      {i < c.activities.length - 1 && <div className="w-px flex-1 bg-gray-200 mt-1" />}
                    </div>
                    <div className="pb-4 flex-1">
                      <div className="flex items-center gap-2 text-xs text-gray-400 mb-0.5">
                        <span className="font-medium text-gray-600">{a.authorName}</span>
                        <span>·</span>
                        <span>{formatDateTime(a.createdAt)}</span>
                        {a.internal && (
                          <Badge variant="warning" className="ml-1"><Lock size={10} className="mr-0.5" />Εσωτερικό</Badge>
                        )}
                      </div>
                      <div className="text-sm text-gray-800 whitespace-pre-wrap">{a.body}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  rows={3}
                  placeholder={isAdmin ? 'Προσθέστε ενημέρωση...' : 'Προσθέστε σχόλιο...'}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                />
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-4">
                    {isAdmin && (
                      <label className="flex items-center gap-1.5 text-xs text-gray-600">
                        <input type="checkbox" checked={internal} onChange={e => setInternal(e.target.checked)} />
                        Εσωτερική σημείωση (μόνο admin)
                      </label>
                    )}
                    {isAdmin && !internal && (
                      <label className="flex items-center gap-1.5 text-xs text-gray-600">
                        <input type="checkbox" checked={notifyAccountant} onChange={e => setNotifyAccountant(e.target.checked)} />
                        Ενημέρωση λογιστή
                      </label>
                    )}
                  </div>
                  <Button size="sm" onClick={postComment} loading={posting}>
                    <MessageSquare size={14} className="mr-1.5" />
                    Προσθήκη
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {isAdmin && (
            <Card>
              <CardHeader><CardTitle>Διαχείριση</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Κατάσταση</label>
                  <select
                    value={c.status}
                    onChange={e => updateCase({ status: e.target.value, notifyAccountant })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <label className="flex items-center gap-1.5 text-xs text-gray-600 mt-2">
                    <input type="checkbox" checked={notifyAccountant} onChange={e => setNotifyAccountant(e.target.checked)} />
                    Ενημέρωση λογιστή για αλλαγή κατάστασης
                  </label>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Ανάθεση σε</label>
                  <select
                    value={c.assignedToId || ''}
                    onChange={e => updateCase({ assignedToId: e.target.value || null })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Χωρίς ανάθεση</option>
                    {data.assignees?.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Προτεραιότητα</label>
                  <select
                    value={c.priority}
                    onChange={e => updateCase({ priority: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {Object.entries(PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Προθεσμία</label>
                  <input
                    type="date"
                    value={c.dueDate ? c.dueDate.slice(0, 10) : ''}
                    onChange={e => updateCase({ dueDate: e.target.value || null })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Αποτέλεσμα</label>
                  <textarea
                    defaultValue={c.outcome || ''}
                    onBlur={e => updateCase({ outcome: e.target.value })}
                    rows={3}
                    placeholder="Σύνοψη αποτελέσματος..."
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                  />
                </div>

                {c.status !== 'COMPLETED' && (
                  <Button variant="outline" className="w-full" onClick={() => updateCase({ status: 'COMPLETED', notifyAccountant })}>
                    <CheckCircle2 size={14} className="mr-1.5" />
                    Σήμανση ως Ολοκληρωμένη
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ListChecks size={16} />
                Λίστα Εργασιών {c.tasks?.length ? `(${tasksDone}/${c.tasks.length})` : ''}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(c.tasks || []).length === 0 && <p className="text-sm text-gray-400">Δεν υπάρχουν εργασίες</p>}
              {(c.tasks || []).map((t: any) => (
                <div key={t.id} className="flex items-start justify-between gap-2 group">
                  <label className={`flex items-start gap-2 text-sm ${isAdmin ? 'cursor-pointer' : ''} ${t.done ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                    <input
                      type="checkbox"
                      checked={t.done}
                      disabled={!isAdmin}
                      onChange={() => toggleTask(t)}
                      className="mt-0.5"
                    />
                    <span>{t.title}</span>
                  </label>
                  {isAdmin && (
                    <button onClick={() => deleteTask(t.id)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
              {isAdmin && (
                <div className="flex gap-2 pt-2">
                  <input
                    value={newTask}
                    onChange={e => setNewTask(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addTask() }}
                    placeholder="Νέα εργασία..."
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <Button size="sm" variant="outline" onClick={addTask}><Plus size={14} /></Button>
                </div>
              )}
            </CardContent>
          </Card>

          {c.externalRef && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server size={16} />
                  Case Management I-MENTOR
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Αναφορά:</span><span className="font-medium">{c.externalRef}</span></div>
                {c.externalStatus && <div className="flex justify-between"><span className="text-gray-500">Κατάσταση:</span><Badge variant="purple">{c.externalStatus}</Badge></div>}
                {c.externalSyncedAt && <div className="flex justify-between"><span className="text-gray-500">Τελ. συγχρονισμός:</span><span>{formatDateTime(c.externalSyncedAt)}</span></div>}
                {c.resultLink && (
                  <a href={c.resultLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-800 hover:underline">
                    Άνοιγμα στο Case Management <ExternalLink size={13} />
                  </a>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {showQuickSend && (
        <QuickSendModal
          businesses={[{ id: b.id, onomasia: b.onomasia, afm: b.afm }]}
          onClose={() => setShowQuickSend(false)}
          onSent={() => { setShowQuickSend(false); load() }}
        />
      )}

      {showContactAccountant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Επικοινωνία με Λογιστή</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Προς: {c.accountant?.officeName} · Σχετικά με τον πελάτη: {b.onomasia || b.afm} (Υπόθεση #{c.caseNumber})
                </p>
              </div>
              <button onClick={() => setShowContactAccountant(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-3">
              <textarea
                value={accountantMsg}
                onChange={e => setAccountantMsg(e.target.value)}
                rows={6}
                placeholder="Γράψτε το μήνυμά σας προς τον λογιστή..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
              />
            </div>
            <div className="px-6 pb-5 pt-2 flex justify-end gap-3 border-t border-slate-100">
              <button onClick={() => setShowContactAccountant(false)} className="px-4 py-2 rounded-lg text-sm text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors">
                Ακύρωση
              </button>
              <Button size="sm" loading={sendingAccountantMsg} onClick={sendAccountantMessage} disabled={!accountantMsg.trim()}>
                <Send size={14} className="mr-1.5" />
                Αποστολή
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
