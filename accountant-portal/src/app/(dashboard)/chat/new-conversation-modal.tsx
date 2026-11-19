'use client'
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  onClose: () => void
  onCreated: (conv: any) => void
  isAdmin: boolean
}

export default function NewConversationModal({ onClose, onCreated, isAdmin }: Props) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [businessSearch, setBusinessSearch] = useState('')
  const [businesses, setBusinesses] = useState<any[]>([])
  const [selectedBusiness, setSelectedBusiness] = useState<any>(null)
  const [accountants, setAccountants] = useState<any[]>([])
  const [selectedAccountantId, setSelectedAccountantId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isAdmin) {
      fetch('/api/accountants').then(r => r.json()).then(d => setAccountants(Array.isArray(d) ? d : []))
    }
  }, [isAdmin])

  useEffect(() => {
    if (!businessSearch) { setBusinesses([]); return }
    const t = setTimeout(async () => {
      const params = new URLSearchParams({ search: businessSearch, limit: '20' })
      const res = await fetch(`/api/businesses?${params}`)
      const d = await res.json()
      setBusinesses(d.businesses || [])
    }, 300)
    return () => clearTimeout(t)
  }, [businessSearch])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!subject.trim() || !body.trim()) { setError('Συμπληρώστε θέμα και μήνυμα'); return }
    setSaving(true)
    setError('')
    const res = await fetch('/api/chat/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: subject.trim(),
        body: body.trim(),
        businessId: selectedBusiness?.id || null,
        accountantId: isAdmin ? selectedAccountantId : undefined,
      }),
    })
    if (res.ok) {
      onCreated(await res.json())
    } else {
      const d = await res.json()
      setError(d.error || 'Σφάλμα αποστολής')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Νέο μήνυμα προς I-MENTOR</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        {error && <div className="mb-3 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
        <form onSubmit={submit} className="space-y-4">
          {isAdmin && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Λογιστής *</label>
              <select value={selectedAccountantId} onChange={e => setSelectedAccountantId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500">
                <option value="">Επιλέξτε λογιστή...</option>
                {accountants.map((a: any) => (
                  <option key={a.id} value={a.id}>{a.officeName} — {a.contactPerson}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Θέμα *</label>
            <input value={subject} onChange={e => setSubject(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="π.χ. Ερώτηση για πρόγραμμα ΕΣΠΑ" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Επιχείρηση (προαιρετικό)</label>
            {selectedBusiness ? (
              <div className="flex items-center gap-2 border border-indigo-200 rounded-lg px-3 py-2 bg-indigo-50">
                <span className="text-sm text-indigo-800 font-medium flex-1">{selectedBusiness.onomasia || selectedBusiness.afm}</span>
                <button type="button" onClick={() => setSelectedBusiness(null)}
                  className="text-indigo-400 hover:text-indigo-700"><X size={14} /></button>
              </div>
            ) : (
              <div className="relative">
                <input value={businessSearch} onChange={e => setBusinessSearch(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="Αναζήτηση επωνυμίας ή ΑΦΜ..." />
                {businesses.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {businesses.map((b: any) => (
                      <li key={b.id}>
                        <button type="button" onClick={() => { setSelectedBusiness(b); setBusinessSearch(''); setBusinesses([]) }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 transition-colors">
                          <span className="font-medium">{b.onomasia || '—'}</span>
                          <span className="text-gray-400 ml-2 text-xs">{b.afm}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Μήνυμα *</label>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={4}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
              placeholder="Γράψτε το μήνυμά σας..." />
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onClose}>Άκυρο</Button>
            <Button type="submit" loading={saving}>Αποστολή</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
