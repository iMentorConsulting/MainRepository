'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/utils'
import { Briefcase, User, Building2, CheckCircle2, ArrowRight, MessageSquare, Lock } from 'lucide-react'

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
  NOTE: 'bg-slate-400', CONTACT_LOG: 'bg-emerald-500',
}

export default function CaseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'ADMIN'
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [comment, setComment] = useState('')
  const [internal, setInternal] = useState(false)
  const [notifyAccountant, setNotifyAccountant] = useState(false)
  const [posting, setPosting] = useState(false)

  async function load() {
    const res = await fetch(`/api/cases/${id}`)
    if (res.ok) setData(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

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

  if (loading) {
    return <div className="flex items-center justify-center h-48"><div className="animate-spin w-8 h-8 border-4 border-blue-800 border-t-transparent rounded-full" /></div>
  }
  if (!data) return <div className="text-center text-gray-400 py-12">Δεν βρέθηκε η υπόθεση</div>

  const c = data.case

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Briefcase size={14} />
            Υπόθεση #{c.caseNumber}
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{c.title}</h1>
          <div className="flex flex-wrap gap-2 mt-2">
            <Badge variant={STATUS_VARIANT[c.status]}>{STATUS_LABELS[c.status]}</Badge>
            <Badge variant="secondary">{PRIORITY_LABELS[c.priority]}</Badge>
            <Badge variant="secondary">{TYPE_LABELS[c.requestType] || c.requestType}</Badge>
          </div>
        </div>
        {!isAdmin && c.status === 'NEW' && (
          <Button variant="outline" onClick={() => updateCase({ status: 'CANCELLED' })}>Ακύρωση Υπόθεσης</Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle>Στοιχεία</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <Building2 size={14} className="text-gray-400" />
                <span className="text-gray-500">Επιχείρηση:</span>
                <Link href={`/businesses/${c.business?.id}`} className="font-medium text-blue-800 hover:underline">{c.business?.onomasia || c.business?.afm}</Link>
              </div>
              <div className="flex items-center gap-2">
                <User size={14} className="text-gray-400" />
                <span className="text-gray-500">Λογιστής:</span>
                <span className="font-medium">{c.accountant?.officeName}</span>
              </div>
              {c.program && (
                <div className="flex items-center gap-2">
                  <ArrowRight size={14} className="text-gray-400" />
                  <span className="text-gray-500">Πρόγραμμα:</span>
                  <Link href={`/programs/${c.program.id}`} className="font-medium text-blue-800 hover:underline">{c.program.title}</Link>
                </div>
              )}
              {c.description && (
                <div>
                  <div className="text-gray-500 mb-1">Περιγραφή</div>
                  <div className="bg-gray-50 rounded-lg p-3 whitespace-pre-wrap">{c.description}</div>
                </div>
              )}
              {c.outcome && (
                <div>
                  <div className="text-gray-500 mb-1">Αποτέλεσμα</div>
                  <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 whitespace-pre-wrap">{c.outcome}</div>
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

        {isAdmin && (
          <div className="space-y-6">
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
          </div>
        )}
      </div>
    </div>
  )
}
