'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/table'
import { Modal } from '@/components/ui/modal'
import { Plus, MessageSquare, Paperclip, Download } from 'lucide-react'
import { formatDate } from '@/lib/utils'

const statusLabel: Record<string, string> = {
  NEW: 'Νέο', IN_REVIEW: 'Υπό Εξέταση', COMPLETED: 'Ολοκληρώθηκε', REJECTED: 'Απορρίφθηκε'
}
const statusVariant: Record<string, any> = {
  NEW: 'default', IN_REVIEW: 'warning', COMPLETED: 'success', REJECTED: 'danger'
}

export default function RequestsPage() {
  const { data: session } = useSession()
  const [requests, setRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRequest, setSelectedRequest] = useState<any>(null)
  const [showNew, setShowNew] = useState(false)
  const isAdmin = session?.user?.role === 'ADMIN'

  useEffect(() => {
    fetch('/api/requests')
      .then(r => r.json())
      .then(d => setRequests(d.requests || []))
      .finally(() => setLoading(false))
  }, [])

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/requests/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r))
    if (selectedRequest?.id === id) setSelectedRequest((prev: any) => ({ ...prev, status }))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Αιτήματα προς I-MENTOR</h1>
          <p className="text-gray-500 mt-1">{requests.length} αιτήματα</p>
        </div>
        {!isAdmin && (
          <Button onClick={() => setShowNew(true)}>
            <Plus size={16} className="mr-2" />
            Νέο Αίτημα
          </Button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin w-8 h-8 border-4 border-blue-800 border-t-transparent rounded-full" />
          </div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <Th>Θέμα</Th>
                {isAdmin && <Th>Λογιστής</Th>}
                <Th>Επιχείρηση</Th>
                <Th>Πρόγραμμα</Th>
                <Th>Κατάσταση</Th>
                <Th>Ημερομηνία</Th>
                <Th></Th>
                <Th>Ενέργειες</Th>
              </TableRow>
            </TableHead>
            <TableBody>
              {requests.length === 0 ? (
                <TableRow>
                  <Td colSpan={7} className="text-center text-gray-400 py-8">Δεν βρέθηκαν αιτήματα</Td>
                </TableRow>
              ) : (
                requests.map(r => (
                  <TableRow key={r.id}>
                    <Td>
                      <button
                        onClick={() => setSelectedRequest(r)}
                        className="font-medium text-blue-800 hover:underline text-left"
                      >
                        {r.subject}
                      </button>
                    </Td>
                    {isAdmin && <Td className="text-sm text-gray-500">{r.accountant?.officeName}</Td>}
                    <Td className="text-sm">{r.business?.onomasia || r.business?.afm}</Td>
                    <Td className="text-sm text-gray-500">{r.program?.title || '-'}</Td>
                    <Td><Badge variant={statusVariant[r.status]}>{statusLabel[r.status]}</Badge></Td>
                    <Td className="text-sm text-gray-500">{formatDate(r.createdAt)}</Td>
                    <Td>{r.attachmentUrl && <span title={r.attachmentName || 'Συνημμένο'}><Paperclip size={14} className="text-indigo-400" /></span>}</Td>
                    <Td>
                      {isAdmin && (
                        <select
                          value={r.status}
                          onChange={e => updateStatus(r.id, e.target.value)}
                          className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none"
                        >
                          <option value="NEW">Νέο</option>
                          <option value="IN_REVIEW">Υπό Εξέταση</option>
                          <option value="COMPLETED">Ολοκληρώθηκε</option>
                          <option value="REJECTED">Απορρίφθηκε</option>
                        </select>
                      )}
                    </Td>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Detail Modal */}
      <Modal open={!!selectedRequest} onClose={() => setSelectedRequest(null)} title="Λεπτομέρειες Αιτήματος" size="lg">
        {selectedRequest && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-500">Λογιστής: </span>{selectedRequest.accountant?.officeName}</div>
              <div><span className="text-gray-500">Επιχείρηση: </span>{selectedRequest.business?.onomasia}</div>
              <div><span className="text-gray-500">ΑΦΜ: </span>{selectedRequest.business?.afm}</div>
              <div><span className="text-gray-500">Κατάσταση: </span>
                <Badge variant={statusVariant[selectedRequest.status]}>{statusLabel[selectedRequest.status]}</Badge>
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-700 mb-1">Θέμα</div>
              <div className="text-sm">{selectedRequest.subject}</div>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-700 mb-1">Μήνυμα</div>
              <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700 whitespace-pre-wrap">{selectedRequest.message}</div>
            </div>
            {selectedRequest.attachmentUrl && (
              <div>
                <div className="text-sm font-medium text-gray-700 mb-1">Συνημμένο Έγγραφο</div>
                <a
                  href={selectedRequest.attachmentUrl}
                  download={selectedRequest.attachmentName || 'attachment'}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-50 border border-indigo-200 text-sm text-indigo-700 hover:bg-indigo-100 transition-colors"
                >
                  <Paperclip size={14} />
                  {selectedRequest.attachmentName || 'Λήψη εγγράφου'}
                  <Download size={13} />
                </a>
              </div>
            )}
            {isAdmin && (
              <div className="pt-2">
                <label className="text-sm font-medium text-gray-700 mb-2 block">Αλλαγή Κατάστασης</label>
                <div className="flex gap-2">
                  {['NEW', 'IN_REVIEW', 'COMPLETED', 'REJECTED'].map(s => (
                    <Button
                      key={s}
                      size="sm"
                      variant={selectedRequest.status === s ? 'default' : 'outline'}
                      onClick={() => updateStatus(selectedRequest.id, s)}
                    >
                      {statusLabel[s]}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* New Request Modal */}
      <NewRequestModal
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={(req) => { setRequests(prev => [req, ...prev]); setShowNew(false) }}
      />
    </div>
  )
}

function NewRequestModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (r: any) => void }) {
  const [businesses, setBusinesses] = useState<any[]>([])
  const [programs, setPrograms] = useState<any[]>([])
  const [form, setForm] = useState({ businessId: '', programId: '', subject: '', message: '' })
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    fetch('/api/businesses?limit=100').then(r => r.json()).then(d => setBusinesses(d.businesses || []))
    fetch('/api/programs').then(r => r.json()).then(d => setPrograms(d.programs || []))
  }, [open])

  async function handleSubmit() {
    if (!form.businessId || !form.subject || !form.message) {
      alert('Συμπληρώστε τα υποχρεωτικά πεδία')
      return
    }
    setSaving(true)

    let attachmentUrl: string | null = null
    let attachmentName: string | null = null

    if (attachmentFile) {
      attachmentName = attachmentFile.name
      await new Promise<void>((resolve) => {
        const reader = new FileReader()
        reader.onload = (e) => { attachmentUrl = e.target?.result as string; resolve() }
        reader.readAsDataURL(attachmentFile)
      })
    }

    const res = await fetch('/api/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, attachmentUrl, attachmentName }),
    })
    if (res.ok) {
      const created = await res.json()
      onCreated(created)
      setForm({ businessId: '', programId: '', subject: '', message: '' })
      setAttachmentFile(null)
    }
    setSaving(false)
  }

  return (
    <Modal open={open} onClose={onClose} title="Νέο Αίτημα προς I-MENTOR" size="lg">
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Επιχείρηση *</label>
          <select
            value={form.businessId}
            onChange={e => setForm(p => ({ ...p, businessId: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Επιλέξτε επιχείρηση...</option>
            {businesses.map(b => <option key={b.id} value={b.id}>{b.onomasia || b.afm} ({b.afm})</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Πρόγραμμα</label>
          <select
            value={form.programId}
            onChange={e => setForm(p => ({ ...p, programId: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Χωρίς πρόγραμμα</option>
            {programs.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Θέμα *</label>
          <input
            value={form.subject}
            onChange={e => setForm(p => ({ ...p, subject: e.target.value }))}
            placeholder="π.χ. Αίτηση υποβολής για ΕΣΠΑ - ΑΦΜ 123456789"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Αναλυτική Περιγραφή *</label>
          <textarea
            value={form.message}
            onChange={e => setForm(p => ({ ...p, message: e.target.value }))}
            rows={7}
            placeholder="Περιγράψτε αναλυτικά το αίτημά σας: τι χρειάζεστε, ποιο είναι το πρόβλημα, τι έχετε ήδη κάνει..."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">
            <Paperclip size={14} className="inline mr-1" />
            Συνημμένο Έγγραφο (προαιρετικό)
          </label>
          <input
            type="file"
            accept=".pdf,.doc,.docx,.xlsx,.xls,.jpg,.jpeg,.png"
            onChange={e => setAttachmentFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-gray-100 file:text-gray-700 file:font-medium hover:file:bg-gray-200"
          />
          {attachmentFile && (
            <p className="text-xs text-gray-500 mt-1">{attachmentFile.name} ({(attachmentFile.size / 1024).toFixed(0)} KB)</p>
          )}
        </div>
        <div className="flex gap-3">
          <Button onClick={handleSubmit} loading={saving}>Υποβολή Αιτήματος</Button>
          <Button variant="outline" onClick={onClose}>Ακύρωση</Button>
        </div>
      </div>
    </Modal>
  )
}
