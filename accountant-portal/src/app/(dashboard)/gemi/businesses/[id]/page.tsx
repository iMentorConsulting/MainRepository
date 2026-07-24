'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { CategoryBadge } from '@/components/businesses/category-badge'
import { ArrowLeft, Building2, Mail, Phone, MapPin, Briefcase, Target, Send, Link2, Pencil, Printer, ClipboardList, Scale, Plus, Trash2, Zap } from 'lucide-react'
import { getEffectiveCategory } from '@/lib/business-categories'
import { resolveRegionFromZip } from '@/lib/greek-regions'

const STATUS_LABELS: Record<string, string> = {
  POTENTIAL: 'Πιθανό', REVIEWED: 'Ελέγχθηκε', REJECTED: 'Απορρίφθηκε',
  INTERESTED: 'Ενδιαφέρον', SUBMITTED: 'Υποβλήθηκε',
}
const STATUS_VARIANT: Record<string, any> = {
  POTENTIAL: 'secondary', REVIEWED: 'info', REJECTED: 'danger',
  INTERESTED: 'success', SUBMITTED: 'success',
}

function formatGreekDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null
  // AADE returns 'YYYY-MM-DD' or 'DD/MM/YYYY' — normalise to el-GR
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const isDeactivated = (b: any) => !!b.stopDate

export default function GemiBusinessDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: session, status } = useSession()
  const router = useRouter()
  const [business, setBusiness] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState(false)
  const [claimMsg, setClaimMsg] = useState('')
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<Record<string, string>>({})
  const [editActivities, setEditActivities] = useState<{ firmActCode: string; firmActDescr: string; firmActKind: number }[]>([])
  const [newKadCode, setNewKadCode] = useState('')
  const [newKadDescr, setNewKadDescr] = useState('')
  const [saving, setSaving] = useState(false)
  const [editMsg, setEditMsg] = useState('')
  const [rematching, setRematching] = useState(false)

  const isAdmin = ['ADMIN', 'CONSULTANT'].includes((session?.user as any)?.role ?? '')

  useEffect(() => {
    if (status === 'loading') return
    if (!isAdmin) { router.push('/'); return }
    fetch(`/api/gemi/businesses/${id}`)
      .then(r => r.json())
      .then(d => setBusiness(d))
      .finally(() => setLoading(false))
  }, [id, isAdmin, router, status])

  function startEdit() {
    setEditForm({
      onomasia: business.onomasia || '',
      email: business.email || '',
      phone: business.phone || '',
      postalAddress: business.postalAddress || '',
      postalAddressNo: business.postalAddressNo || '',
      postalZipCode: business.postalZipCode || '',
      postalAreaDescription: business.postalAreaDescription || '',
    })
    const acts = Array.isArray(business.activities) ? business.activities : []
    setEditActivities(acts.map((a: any) => ({
      firmActCode: a.firmActCode ?? '',
      firmActDescr: a.firmActDescr ?? '',
      firmActKind: a.firmActKind ?? 2,
    })))
    setNewKadCode('')
    setNewKadDescr('')
    setEditMsg('')
    setEditing(true)
  }

  async function handleSaveEdit() {
    setSaving(true)
    setEditMsg('')
    const res = await fetch(`/api/gemi/businesses/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...editForm, activities: editActivities }),
    })
    if (res.ok) {
      const updated = await fetch(`/api/gemi/businesses/${id}`).then(r => r.json())
      setBusiness(updated)
      setEditing(false)
    } else {
      const err = await res.json().catch(() => ({}))
      setEditMsg(`Σφάλμα: ${err.error || 'Αδυναμία αποθήκευσης'}`)
    }
    setSaving(false)
  }

  async function handleRematch() {
    setRematching(true)
    const res = await fetch('/api/gemi/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id] }),
    })
    const data = await res.json()
    if (res.ok) {
      const updated = await fetch(`/api/gemi/businesses/${id}`).then(r => r.json())
      setBusiness(updated)
    } else {
      alert(data.error || 'Σφάλμα ταιριάσματος')
    }
    setRematching(false)
  }

  function addKad() {
    if (!newKadCode.trim()) return
    const isFirst = editActivities.length === 0
    setEditActivities(prev => [...prev, {
      firmActCode: newKadCode.trim(),
      firmActDescr: newKadDescr.trim(),
      firmActKind: isFirst ? 1 : 2,
    }])
    setNewKadCode('')
    setNewKadDescr('')
  }

  function removeKad(idx: number) {
    setEditActivities(prev => {
      const next = prev.filter((_, i) => i !== idx)
      // Ensure first remaining entry is primary
      if (next.length > 0 && next[0].firmActKind !== 1) {
        next[0] = { ...next[0], firmActKind: 1 }
      }
      return next
    })
  }

  function setKadPrimary(idx: number) {
    setEditActivities(prev => prev.map((a, i) => ({ ...a, firmActKind: i === idx ? 1 : 2 })))
  }

  // Ensures a real Business record exists (claims if needed) and returns its id.
  async function ensureBusinessId(): Promise<string | null> {
    if (business.claimedBusinessId) return business.claimedBusinessId
    const res = await fetch(`/api/gemi/businesses/${id}/claim`, { method: 'POST' })
    const data = await res.json()
    if (!res.ok) {
      setClaimMsg(`✗ ${data.error || 'Σφάλμα ανάκτησης'}`)
      return null
    }
    const updated = await fetch(`/api/gemi/businesses/${id}`).then(r => r.json())
    setBusiness(updated)
    return data.business?.id ?? null
  }

  async function handleAssignGrant() {
    setClaiming(true)
    const bizId = await ensureBusinessId()
    setClaiming(false)
    if (bizId) router.push(`/businesses/${bizId}?newCase=1`)
  }

  async function handleAssignExodikastikos() {
    setClaiming(true)
    const bizId = await ensureBusinessId()
    setClaiming(false)
    if (bizId) router.push(`/exodikastikos/new?businessId=${bizId}`)
  }

  async function handleClaim() {
    if (!window.confirm('Ανάκτηση αυτής της επιχείρησης; Θα δημιουργηθεί ή θα συνδεθεί με πραγματική εγγραφή Business.')) return
    setClaiming(true)
    const res = await fetch(`/api/gemi/businesses/${id}/claim`, { method: 'POST' })
    const data = await res.json()
    if (res.ok) {
      setClaimMsg(`✓ Ανακτήθηκε — Business ID: ${data.business?.id}`)
      const updated = await fetch(`/api/gemi/businesses/${id}`).then(r => r.json())
      setBusiness(updated)
    } else {
      setClaimMsg(`✗ ${data.error}`)
    }
    setClaiming(false)
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" /></div>
  if (!business || business.error) return <div className="text-center py-16 text-gray-400">Δεν βρέθηκε η εγγραφή.</div>

  const activities = Array.isArray(business.activities) ? business.activities : []
  const deactivated = isDeactivated(business)
  const category = getEffectiveCategory({ tags: business.tags, activities })
  const region = resolveRegionFromZip(business.postalZipCode)

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/gemi/businesses">
            <Button variant="ghost" size="sm"><ArrowLeft size={16} className="mr-1" />Επιστροφή</Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{business.onomasia || business.afm}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="text-sm text-gray-500 font-mono">ΑΦΜ: {business.afm}</span>
              {business.legalStatusDescr && <Badge variant="secondary">{business.legalStatusDescr}</Badge>}
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">ΓΕΜΗ</span>
              {deactivated && <Badge variant="danger">Ανενεργή</Badge>}
              {!deactivated && business.aadeEnriched && <Badge variant="success">Ενεργή</Badge>}
              {category && <CategoryBadge category={category} size="lg" />}
              {region && (
                <Badge variant="info" className="flex items-center gap-1">
                  <MapPin size={11} />{region}
                </Badge>
              )}
              {business.claimedAt && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-300">
                  <Link2 size={10} /> Ανακτήθηκε
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap justify-end">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer size={14} className="mr-1" />Εκτύπωση / PDF
          </Button>
          <Link href={`/gemi/quick-send?afm=${business.afm}`}>
            <Button className="bg-indigo-600 hover:bg-indigo-700 text-white">
              <Send size={14} className="mr-1" />Γρήγορη Αποστολή
            </Button>
          </Link>
          <Button variant="outline" onClick={handleAssignGrant} loading={claiming}>
            <ClipboardList size={14} className="mr-1" />Ανάθεση Επιχορήγησης
          </Button>
          <Button variant="outline" onClick={handleAssignExodikastikos} loading={claiming}>
            <Scale size={14} className="mr-1" />Ανάθεση Εξωδικαστικού
          </Button>
          <Button variant="outline" onClick={handleRematch} loading={rematching} className="border-indigo-300 text-indigo-700 hover:bg-indigo-50">
            <Zap size={14} className="mr-1" />Ταίριασμα
          </Button>
          <Button variant="outline" onClick={startEdit}>
            <Pencil size={14} className="mr-1" />Επεξεργασία
          </Button>
          {!business.claimedAt && (
            <Button onClick={handleClaim} loading={claiming} className="bg-purple-600 hover:bg-purple-700 text-white">
              <Link2 size={15} className="mr-2" />Ανάκτηση από Λογιστή
            </Button>
          )}
          {business.claimedAt && business.claimedBusinessId && (
            <Link href={`/businesses/${business.claimedBusinessId}`}>
              <Button variant="outline"><Link2 size={15} className="mr-2" />Προβολή στους Λογιστές</Button>
            </Link>
          )}
        </div>
      </div>

      {claimMsg && <div className={`px-4 py-3 rounded-lg text-sm ${claimMsg.startsWith('✓') ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>{claimMsg}</div>}

      {editing && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Pencil size={14} />Επεξεργασία Στοιχείων</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Επωνυμία</label>
              <Input value={editForm.onomasia} onChange={e => setEditForm(f => ({ ...f, onomasia: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Email</label>
              <Input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Τηλέφωνο</label>
              <Input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Οδός</label>
              <Input value={editForm.postalAddress} onChange={e => setEditForm(f => ({ ...f, postalAddress: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Αριθμός</label>
              <Input value={editForm.postalAddressNo} onChange={e => setEditForm(f => ({ ...f, postalAddressNo: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">ΤΚ</label>
              <Input value={editForm.postalZipCode} onChange={e => setEditForm(f => ({ ...f, postalZipCode: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">Πόλη/Περιοχή</label>
              <Input value={editForm.postalAreaDescription} onChange={e => setEditForm(f => ({ ...f, postalAreaDescription: e.target.value }))} />
            </div>
          </div>
          {/* KAD editor */}
          <div>
            <label className="text-xs text-gray-500 mb-2 block font-medium">ΚΑΔ Δραστηριότητες</label>
            <div className="space-y-1.5 mb-3">
              {editActivities.length === 0 && (
                <p className="text-xs text-gray-400 italic">Δεν υπάρχουν ΚΑΔ. Προσθέστε παρακάτω.</p>
              )}
              {editActivities.map((act, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                  <span className="font-mono text-xs bg-white border border-gray-200 px-2 py-0.5 rounded w-28 shrink-0">{act.firmActCode}</span>
                  <span className="text-xs text-gray-700 flex-1 truncate">{act.firmActDescr || '—'}</span>
                  <button
                    type="button"
                    onClick={() => setKadPrimary(idx)}
                    className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${act.firmActKind === 1 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500 hover:bg-amber-50 hover:text-amber-600'}`}
                    title="Ορισμός ως κύρια δραστηριότητα"
                  >
                    {act.firmActKind === 1 ? 'κύρια' : 'δευτ.'}
                  </button>
                  <button type="button" onClick={() => removeKad(idx)} className="text-gray-400 hover:text-red-500 shrink-0">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newKadCode}
                onChange={e => setNewKadCode(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addKad()}
                placeholder="Κωδικός ΚΑΔ"
                className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs font-mono w-32 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <input
                type="text"
                value={newKadDescr}
                onChange={e => setNewKadDescr(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addKad()}
                placeholder="Περιγραφή (προαιρετικό)"
                className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs flex-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={addKad}
                disabled={!newKadCode.trim()}
                className="flex items-center gap-1 text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 shrink-0"
              >
                <Plus size={12} />Προσθήκη
              </button>
            </div>
          </div>

          {editMsg && <p className="text-sm text-red-600">{editMsg}</p>}
          <div className="flex gap-2">
            <Button onClick={handleSaveEdit} loading={saving}>Αποθήκευση</Button>
            <Button variant="outline" onClick={() => setEditing(false)}>Ακύρωση</Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Basic info */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2"><Building2 size={14} />Στοιχεία Επιχείρησης</h2>
          <dl className="space-y-3 text-sm">
            {([
              ['Επωνυμία', business.onomasia],
              ['Νομική Μορφή', business.legalStatusDescr],
              ['ΑΦΜ', business.afm],
              ['ΔΟΥ', business.doyDescr || business.doy],
              ['Ημ. Ίδρυσης', formatGreekDate(business.regdate)],
              ['Κατάσταση', business.aadeEnriched ? (deactivated ? 'Ανενεργή' + (business.stopDate ? ` (Παύση ${formatGreekDate(business.stopDate)})` : '') : 'Ενεργή') : null],
              ['Παρτίδα Εισαγωγής', business.importBatch],
            ] as [string, string | null][]).map(([label, val]) => val ? (
              <div key={label} className="flex gap-3">
                <dt className="w-36 shrink-0 text-gray-500">{label}</dt>
                <dd className={`font-medium ${label === 'Κατάσταση' ? (deactivated ? 'text-red-600' : 'text-green-700') : 'text-gray-900'}`}>{val}</dd>
              </div>
            ) : null)}
          </dl>
        </div>

        {/* Contact */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2"><Mail size={14} />Επικοινωνία & Διεύθυνση</h2>
          <dl className="space-y-3 text-sm">
            {business.email && (
              <div className="flex gap-3 items-center">
                <dt className="w-36 shrink-0 text-gray-500 flex items-center gap-1"><Mail size={12} />Email</dt>
                <dd><a href={`mailto:${business.email}`} className="text-blue-700 hover:underline">{business.email}</a></dd>
              </div>
            )}
            {business.phone && (
              <div className="flex gap-3 items-center">
                <dt className="w-36 shrink-0 text-gray-500 flex items-center gap-1"><Phone size={12} />Τηλέφωνο</dt>
                <dd><a href={`tel:${business.phone}`} className="text-blue-700 hover:underline">{business.phone}</a></dd>
              </div>
            )}
            {(business.postalAddress || business.postalAreaDescription) && (
              <div className="flex gap-3">
                <dt className="w-36 shrink-0 text-gray-500 flex items-center gap-1"><MapPin size={12} />Διεύθυνση</dt>
                <dd className="text-gray-900">
                  {[business.postalAddress, business.postalAddressNo].filter(Boolean).join(' ')}
                  {business.postalZipCode && `, ${business.postalZipCode}`}
                  {business.postalAreaDescription && <><br />{business.postalAreaDescription}</>}
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* Processing status */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Κατάσταση Επεξεργασίας</h2>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-500">ΑΑΔΕ Εμπλουτισμός</span>
              {business.aadeEnriched
                ? <Badge variant="success">✓ Εμπλουτισμένη</Badge>
                : <Badge variant="secondary">Σε αναμονή</Badge>}
            </div>
            {business.aadeError && <p className="text-xs text-red-500">{business.aadeError}</p>}
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Ταύτιση Προγραμμάτων</span>
              {business.matchingDone
                ? <Badge variant="success">✓ Έγινε ({business.programMatches?.length ?? 0})</Badge>
                : <Badge variant="secondary">Σε αναμονή</Badge>}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Ανάκτηση</span>
              {business.claimedAt
                ? <Badge variant="info">Ανακτήθηκε {new Date(business.claimedAt).toLocaleDateString('el-GR')}</Badge>
                : <Badge variant="secondary">Διαθέσιμη</Badge>}
            </div>
            {business.claimedAccountant && (
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Λογιστής</span>
                <span className="text-sm font-medium">{business.claimedAccountant.officeName || business.claimedAccountant.contactPerson}</span>
              </div>
            )}
            {business.unsubscribedAt && (
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Unsubscribe</span>
                <Badge variant="danger">Αποχώρησε {new Date(business.unsubscribedAt).toLocaleDateString('el-GR')}</Badge>
              </div>
            )}
          </div>
        </div>

        {/* KAD Activities */}
        {activities.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2"><Briefcase size={14} />ΚΑΔ Δραστηριότητες</h2>
            <ul className="space-y-2">
              {activities.map((act: any, i: number) => (
                <li key={i} className="text-sm flex gap-2">
                  <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded shrink-0 self-start mt-0.5">{act.firmActCode}</span>
                  <span className="text-gray-700">{act.firmActDescr || '—'}</span>
                  {act.firmActKind === 1 && <span className="text-xs text-amber-600 font-medium shrink-0">(κύρια)</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Program matches */}
      {business.programMatches?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2"><Target size={14} />Ταιριάσματα Προγραμμάτων ({business.programMatches.length})</h2>
            <Link href={`/gemi/campaigns/new?programId=${business.programMatches[0]?.programId}`}>
              <Button variant="outline" size="sm"><Send size={12} className="mr-1" />Καμπάνια</Button>
            </Link>
          </div>
          <div className="divide-y">
            {business.programMatches.map((m: any) => (
              <div key={m.id} className="py-3 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <Link href={`/programs/${m.programId}`} className="text-sm font-medium text-blue-700 hover:underline truncate block">{m.program?.title}</Link>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {m.matchReason?.slice(0, 3).map((r: string, i: number) => (
                      <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{r}</span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-bold text-green-700">{m.matchScore}%</span>
                  <Badge variant={STATUS_VARIANT[m.status] ?? 'secondary'}>{STATUS_LABELS[m.status] ?? m.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Campaign history */}
      {business.campaignRecipients?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2"><Send size={14} />Ιστορικό Καμπανιών</h2>
          <div className="divide-y text-sm">
            {business.campaignRecipients.map((r: any) => (
              <div key={r.id} className="py-3 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-900 truncate">{r.campaign?.title}</span>
                    <span className="text-xs text-gray-400 shrink-0">{r.channel}</span>
                  </div>
                  {r.recipient && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{r.recipient}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs shrink-0">
                  {r.sentAt && (
                    <span className="text-gray-500">{new Date(r.sentAt).toLocaleDateString('el-GR')}</span>
                  )}
                  {r.bouncedAt ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                      ✗ Bounce
                    </span>
                  ) : r.unsubscribedAt ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">
                      Διαγραφή
                    </span>
                  ) : (r.openedAt || r.clickedAt) ? (
                    // A click implies an open even if Moosend's tracking pixel was blocked
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                      ✓ Άνοιξε{r.openCount > 1 ? ` (${r.openCount}×)` : ''}
                    </span>
                  ) : r.status === 'sent' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                      Εστάλη / Δεν άνοιξε
                    </span>
                  ) : (
                    <span className="text-gray-400">{r.status}</span>
                  )}
                  {r.clickedAt && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                      ✓ Κλικ{r.clickCount > 1 ? ` (${r.clickCount}×)` : ''}
                    </span>
                  )}
                  {r.errorMessage && (
                    <span className="text-red-500 max-w-[180px] truncate" title={r.errorMessage}>
                      ✗ {r.errorMessage}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
