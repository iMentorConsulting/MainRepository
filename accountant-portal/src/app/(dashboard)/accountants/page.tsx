'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/table'
import { Plus, Search, Edit, Trash2, Building2, ShieldCheck, Target, ImagePlus, X } from 'lucide-react'

interface Accountant {
  id: string
  officeName: string
  contactPerson: string
  email: string
  phone: string | null
  active: boolean
  approved: boolean
  logoUrl?: string | null
  _count: { businesses: number; users: number }
  eligibleMatches?: number
}

export default function AccountantsPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const [accountants, setAccountants] = useState<Accountant[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadTargetRef = useRef<string | null>(null)

  useEffect(() => {
    if (status === 'loading') return
    if (session && session.user.role !== 'ADMIN') {
      const accountantId = (session.user as any)?.accountantId
      router.replace(accountantId ? `/accountants/${accountantId}` : '/')
      return
    }
    if (session?.user.role !== 'ADMIN') return

    fetch('/api/accountants')
      .then(r => r.json())
      .then(data => setAccountants(data.accountants || []))
      .finally(() => setLoading(false))
  }, [session, status, router])

  const filtered = accountants.filter(a =>
    a.officeName.toLowerCase().includes(search.toLowerCase()) ||
    a.contactPerson.toLowerCase().includes(search.toLowerCase()) ||
    a.email.toLowerCase().includes(search.toLowerCase())
  )

  async function handleDelete(id: string) {
    if (!confirm('Διαγραφή λογιστή; Αυτή η ενέργεια είναι μη αναστρέψιμη.')) return
    const res = await fetch(`/api/accountants/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(`Σφάλμα διαγραφής: ${data.error || res.status}`)
      return
    }
    setAccountants(prev => prev.filter(a => a.id !== id))
  }

  function handleLogoClick(id: string) {
    uploadTargetRef.current = id
    fileInputRef.current?.click()
  }

  async function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    const id = uploadTargetRef.current
    if (!file || !id) return
    e.target.value = ''

    const reader = new FileReader()
    reader.onload = async () => {
      const dataUrl = reader.result as string
      setUploadingId(id)
      try {
        const res = await fetch(`/api/accountants/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ logoUrl: dataUrl }),
        })
        if (res.ok) {
          setAccountants(prev => prev.map(a => a.id === id ? { ...a, logoUrl: dataUrl } : a))
        }
      } finally {
        setUploadingId(null)
      }
    }
    reader.readAsDataURL(file)
  }

  async function handleLogoRemove(id: string) {
    setUploadingId(id)
    try {
      const res = await fetch(`/api/accountants/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logoUrl: null }),
      })
      if (res.ok) {
        setAccountants(prev => prev.map(a => a.id === id ? { ...a, logoUrl: null } : a))
      }
    } finally {
      setUploadingId(null)
    }
  }

  async function handleApprove(id: string) {
    if (!confirm('Έγκριση πρόσβασης ΑΑΔΕ για αυτό το γραφείο;')) return
    const res = await fetch(`/api/accountants/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved: true }),
    })
    if (res.ok) {
      setAccountants(prev => prev.map(a => a.id === id ? { ...a, approved: true } : a))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Λογιστές</h1>
          <p className="text-gray-500 mt-1">Διαχείριση λογιστικών γραφείων</p>
        </div>
        <Link href="/accountants/new">
          <Button>
            <Plus size={16} className="mr-2" />
            Νέος Λογιστής
          </Button>
        </Link>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleLogoFile}
      />

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-4 border-b border-gray-100">
          <div className="relative max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Αναζήτηση λογιστή..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin w-8 h-8 border-4 border-blue-800 border-t-transparent rounded-full" />
          </div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <Th>Γραφείο</Th>
                <Th>Υπεύθυνος</Th>
                <Th>Email</Th>
                <Th>Τηλέφωνο</Th>
                <Th>Επιχειρήσεις</Th>
                <Th>Matches (επιλέξιμα)</Th>
                <Th>Λογότυπο</Th>
                <Th>Κατάσταση</Th>
                <Th>Ενέργειες</Th>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <Td colSpan={9} className="text-center text-gray-400 py-8">
                    Δεν βρέθηκαν λογιστές
                  </Td>
                </TableRow>
              ) : (
                filtered.map(a => (
                  <TableRow key={a.id}>
                    <Td>
                      <Link href={`/accountants/${a.id}`} className="font-medium text-blue-800 hover:underline">
                        {a.officeName}
                      </Link>
                    </Td>
                    <Td>{a.contactPerson}</Td>
                    <Td className="text-gray-500">{a.email}</Td>
                    <Td className="text-gray-500">{a.phone || '-'}</Td>
                    <Td>
                      <span className="flex items-center gap-1">
                        <Building2 size={14} className="text-gray-400" />
                        {a._count.businesses}
                      </span>
                    </Td>
                    <Td>
                      <span className="flex items-center gap-1">
                        <Target size={14} className="text-gray-400" />
                        {a.eligibleMatches ?? 0}
                      </span>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1.5">
                        {a.logoUrl ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={a.logoUrl} alt="logo" className="h-8 w-8 object-contain rounded border border-gray-200 bg-white p-0.5 cursor-pointer" onClick={() => handleLogoClick(a.id)} title="Αντικατάσταση λογότυπου" />
                            <button
                              onClick={() => handleLogoRemove(a.id)}
                              disabled={uploadingId === a.id}
                              className="text-gray-300 hover:text-red-400 transition-colors"
                              title="Αφαίρεση λογότυπου"
                            >
                              <X size={12} />
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleLogoClick(a.id)}
                            disabled={uploadingId === a.id}
                            className="flex items-center gap-1 text-xs text-gray-400 hover:text-indigo-600 transition-colors"
                            title="Ανέβασμα λογότυπου"
                          >
                            <ImagePlus size={14} />
                            <span>Ανέβασμα</span>
                          </button>
                        )}
                        {uploadingId === a.id && <span className="text-xs text-gray-400">...</span>}
                      </div>
                    </Td>
                    <Td>
                      <div className="flex flex-col gap-1 items-start">
                        <Badge variant={a.active ? 'success' : 'secondary'}>
                          {a.active ? 'Ενεργός' : 'Ανενεργός'}
                        </Badge>
                        {!a.approved && (
                          <Badge variant="warning">Εκκρεμεί έγκριση ΑΑΔΕ</Badge>
                        )}
                      </div>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        {!a.approved && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleApprove(a.id)}
                            className="text-green-600 hover:text-green-700"
                            title="Έγκριση πρόσβασης ΑΑΔΕ"
                          >
                            <ShieldCheck size={14} />
                          </Button>
                        )}
                        <Link href={`/accountants/${a.id}`}>
                          <Button variant="ghost" size="sm">
                            <Edit size={14} />
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(a.id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </Td>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
