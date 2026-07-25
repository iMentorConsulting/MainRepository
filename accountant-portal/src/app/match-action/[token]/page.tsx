'use client'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'

interface Business {
  id: string
  onomasia: string | null
  afm: string
  hasContactInfo: boolean
  hasEmail: boolean
  hasPhone: boolean
  alreadyAssigned: boolean
}

interface PageData {
  accountant: { contactPerson: string; officeName: string }
  program: { id: string; title: string; description: string | null; otherRequirements: string | null; endDate: string | null; maxSubsidyPct: number | null; minSubsidyPct: number | null }
  businesses: Business[]
  stats: { total: number; withContact: number; withoutContact: number; alreadyAssigned: number }
}

type Step = 'select' | 'fill-contacts' | 'done'

export default function MatchActionPage() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<PageData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [step, setStep] = useState<Step>('select')
  const [contacts, setContacts] = useState<Record<string, { email: string; phone: string }>>({})
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ created: number; contactsUpdated: number } | null>(null)

  const [enrichUploading, setEnrichUploading] = useState(false)
  const [enrichCount, setEnrichCount] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`/api/public/match-action/${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return }
        setData(d)
        // Pre-select all businesses that have contact info and are not already assigned
        const preSelected = new Set<string>(
          d.businesses.filter((b: Business) => b.hasContactInfo && !b.alreadyAssigned).map((b: Business) => b.id)
        )
        setSelected(preSelected)
      })
      .catch(() => setError('Σφάλμα φόρτωσης. Δοκιμάστε ξανά.'))
      .finally(() => setLoading(false))
  }, [token])

  function toggleAll() {
    if (!data) return
    const eligible = data.businesses.filter(b => !b.alreadyAssigned).map(b => b.id)
    const allSelected = eligible.every(id => selected.has(id))
    setSelected(allSelected ? new Set() : new Set(eligible))
  }

  function toggleBusiness(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleContinue() {
    if (!data) return
    // Missing = no server-side contact info AND nothing provided via Excel/manual entry
    const needsContact = data.businesses.filter(b =>
      selected.has(b.id) &&
      !b.hasContactInfo &&
      !contacts[b.id]?.email?.trim() &&
      !contacts[b.id]?.phone?.trim()
    )
    if (needsContact.length === 0) {
      submitSelections()
    } else {
      // Init contact state for those that still need it (preserve any already filled)
      const init: Record<string, { email: string; phone: string }> = {}
      for (const b of needsContact) init[b.id] = contacts[b.id] || { email: '', phone: '' }
      setContacts(prev => ({ ...prev, ...init }))
      setStep('fill-contacts')
    }
  }

  async function handleEnrichUpload(file: File) {
    if (!data) return
    setEnrichUploading(true)
    setEnrichCount(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/public/match-action/${token}/enrich-template`, {
        method: 'POST',
        body: fd,
      })
      const json = await res.json()
      if (!json.updates?.length) { setEnrichCount(0); return }
      // Build AFM → business id map
      const afmToId: Record<string, string> = {}
      for (const b of data.businesses) afmToId[b.afm] = b.id
      // Apply updates to contacts state and auto-select those businesses
      let matched = 0
      const newContacts: Record<string, { email: string; phone: string }> = { ...contacts }
      const newSelected = new Set(selected)
      for (const u of json.updates as Array<{ afm: string; email: string; phone: string }>) {
        const id = afmToId[u.afm]
        if (!id) continue
        const biz = data.businesses.find(b => b.id === id)
        if (!biz || biz.alreadyAssigned) continue
        newContacts[id] = { email: u.email || newContacts[id]?.email || '', phone: u.phone || newContacts[id]?.phone || '' }
        if (u.email || u.phone) { newSelected.add(id); matched++ }
      }
      setContacts(newContacts)
      setSelected(newSelected)
      setEnrichCount(matched)
    } catch {
      setEnrichCount(0)
    } finally {
      setEnrichUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function submitSelections() {
    if (!data) return
    setSubmitting(true)
    try {
      const selections = Array.from(selected).map(businessId => ({
        businessId,
        ...(contacts[businessId] || {}),
      }))
      const res = await fetch(`/api/public/match-action/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selections }),
      })
      const json = await res.json()
      setResult(json)
      setStep('done')
    } catch {
      setError('Σφάλμα αποστολής. Δοκιμάστε ξανά.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
      <div style={{ width: 40, height: 40, border: '4px solid #4f46e5', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ background: 'white', borderRadius: 12, padding: '40px 32px', maxWidth: 400, textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        <p style={{ fontSize: 48, margin: '0 0 16px' }}>⚠️</p>
        <p style={{ color: '#374151', fontSize: 16 }}>{error}</p>
      </div>
    </div>
  )

  if (!data) return null

  const { accountant, program, businesses, stats } = data
  const selectedCount = selected.size
  const needsContactFill = businesses.filter(b => selected.has(b.id) && !b.hasContactInfo)
  const withoutContactCount = businesses.filter(b => !b.hasContactInfo && !b.alreadyAssigned).length

  const subsidyText = program.maxSubsidyPct
    ? program.minSubsidyPct && program.minSubsidyPct !== program.maxSubsidyPct
      ? `${program.minSubsidyPct}%–${program.maxSubsidyPct}%`
      : `${program.maxSubsidyPct}%`
    : null

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'Arial, sans-serif', padding: '0 0 60px' }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #4f46e5, #4338ca)', padding: '24px 24px 28px', textAlign: 'center' }}>
        <p style={{ color: 'rgba(255,255,255,0.8)', margin: '0 0 4px', fontSize: 13 }}>I-MENTOR Portal</p>
        <h1 style={{ color: 'white', margin: 0, fontSize: 22, fontWeight: 'bold' }}>🎯 Νέες Ευκαιρίες για τους Πελάτες σας</h1>
        <p style={{ color: 'rgba(255,255,255,0.9)', margin: '8px 0 0', fontSize: 14 }}>
          Αγαπητέ/ή {accountant.contactPerson} — {stats.total} match{stats.total !== 1 ? 'es' : ''} στο πρόγραμμα
        </p>
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 16px' }}>

        {/* Program info strip */}
        <div style={{ background: '#ede9fe', borderRadius: 10, padding: '14px 18px', margin: '20px 0 0', border: '1px solid #c4b5fd' }}>
          <p style={{ margin: 0, color: '#5b21b6', fontWeight: 'bold', fontSize: 15 }}>«{program.title}»</p>
          {subsidyText && <p style={{ margin: '4px 0 0', color: '#6d28d9', fontSize: 13 }}>Επιδότηση: {subsidyText}</p>}
          {program.endDate && (
            <p style={{ margin: '4px 0 0', color: '#7c3aed', fontSize: 13 }}>
              ⏰ Λήξη: {new Date(program.endDate).toLocaleDateString('el-GR')}
            </p>
          )}
        </div>

        {step === 'select' && (
          <>
            {/* Banner */}
            <div style={{ background: 'white', borderRadius: 12, padding: '20px 20px', margin: '16px 0 0', border: '2px solid #4f46e5', boxShadow: '0 2px 16px rgba(79,70,229,0.10)' }}>
              <p style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 'bold', color: '#1e1b4b' }}>
                🤝 Η I-MENTOR αναλαμβάνει τα πάντα για λογαριασμό σας
              </p>
              <p style={{ margin: '0 0 12px', color: '#374151', fontSize: 14, lineHeight: 1.6 }}>
                Επιλέξτε για ποιους πελάτες θέλετε να επικοινωνήσουμε εμείς. Εφόσον ο πελάτης συμφωνήσει, αναλαμβάνουμε ολόκληρη τη διαδικασία — εσείς λαμβάνετε προμήθεια για κάθε υπόθεση που ολοκληρώνεται.
              </p>
              <p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>
                Δεν χρειάζεται να κάνετε τίποτα άλλο. Η ομάδα μας αναλαμβάνει την ενημέρωση, την καθοδήγηση και τη διαχείριση.
              </p>
            </div>

            {/* Other requirements */}
            {program.otherRequirements && (
              <div style={{ background: '#f3f4f6', borderLeft: '4px solid #9ca3af', borderRadius: 6, padding: '12px 16px', margin: '14px 0 0' }}>
                <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 'bold', color: '#374151' }}>Πρόσθετες Προϋποθέσεις:</p>
                <p style={{ margin: 0, fontSize: 13, color: '#4b5563', whiteSpace: 'pre-line' }}>{program.otherRequirements}</p>
              </div>
            )}

            {/* Client table */}
            <div style={{ background: 'white', borderRadius: 12, margin: '16px 0 0', overflow: 'hidden', border: '1px solid #e5e7eb' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <p style={{ margin: 0, fontWeight: 'bold', color: '#111827', fontSize: 15 }}>
                  Πελάτες ({stats.total})
                </p>
                {businesses.some(b => !b.alreadyAssigned) && (
                  <button
                    onClick={toggleAll}
                    style={{ background: 'none', border: 'none', color: '#4f46e5', fontSize: 13, cursor: 'pointer', fontWeight: 600, padding: 0 }}
                  >
                    {businesses.filter(b => !b.alreadyAssigned).every(b => selected.has(b.id)) ? 'Αποεπιλογή όλων' : 'Επιλογή όλων'}
                  </button>
                )}
              </div>

              {businesses.map(b => (
                <div
                  key={b.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px',
                    borderBottom: '1px solid #f3f4f6',
                    background: b.alreadyAssigned ? '#f9fafb' : selected.has(b.id) ? '#f5f3ff' : 'white',
                    opacity: b.alreadyAssigned ? 0.6 : 1,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={b.alreadyAssigned ? true : selected.has(b.id)}
                    disabled={b.alreadyAssigned}
                    onChange={() => !b.alreadyAssigned && toggleBusiness(b.id)}
                    style={{ width: 18, height: 18, accentColor: '#4f46e5', cursor: b.alreadyAssigned ? 'default' : 'pointer', flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 600, color: '#111827', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {b.onomasia || '—'}
                    </p>
                    <p style={{ margin: '2px 0 0', color: '#6b7280', fontSize: 12 }}>ΑΦΜ: {b.afm}</p>
                  </div>
                  <div style={{ flexShrink: 0, fontSize: 12, textAlign: 'right' }}>
                    {b.alreadyAssigned
                      ? <span style={{ color: '#059669', fontWeight: 600 }}>✓ Ανατέθηκε</span>
                      : b.hasContactInfo
                        ? <span style={{ color: '#059669' }}>✓ Στοιχεία</span>
                        : <span style={{ color: '#d97706' }}>⚠ Λείπουν στοιχεία</span>
                    }
                  </div>
                </div>
              ))}
            </div>

            {/* Missing contacts nudge with inline Excel download/upload */}
            {withoutContactCount > 0 && (
              <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: '14px 18px', margin: '14px 0 0' }}>
                <p style={{ margin: '0 0 6px', fontWeight: 'bold', color: '#92400e', fontSize: 14 }}>
                  ⚠️ {withoutContactCount} πελάτ{withoutContactCount === 1 ? 'ης' : 'ες'} χωρίς στοιχεία επικοινωνίας
                </p>
                <p style={{ margin: '0 0 12px', color: '#78350f', fontSize: 13, lineHeight: 1.5 }}>
                  Μπορείτε να συμπληρώσετε στοιχεία χειροκίνητα στο επόμενο βήμα, ή να κατεβάσετε το παρακάτω Excel, να το συμπληρώσετε και να το ανεβάσετε για μαζική εισαγωγή.
                </p>

                {/* Download buttons */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.04em' }}>α) Μόνο τα επιλεγμένα matches αυτού του προγράμματος</p>
                    <a
                      href={`/api/public/match-action/${token}/enrich-template?scope=matches`}
                      download
                      style={{ display: 'inline-block', background: '#f59e0b', color: 'white', borderRadius: 7, padding: '8px 14px', textDecoration: 'none', fontSize: 13, fontWeight: 'bold' }}
                    >
                      ⬇ Excel Matches ({withoutContactCount})
                    </a>
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.04em' }}>β) Όλοι οι πελάτες του γραφείου χωρίς στοιχεία</p>
                    <a
                      href={`/api/public/match-action/${token}/enrich-template?scope=all`}
                      download
                      style={{ display: 'inline-block', background: 'white', color: '#92400e', border: '1px solid #fcd34d', borderRadius: 7, padding: '8px 14px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}
                    >
                      ⬇ Excel Όλοι οι Πελάτες
                    </a>
                  </div>
                </div>

                {/* Upload area */}
                <div
                  style={{ border: '2px dashed #fbbf24', borderRadius: 8, padding: '12px 14px', background: 'white', cursor: 'pointer' }}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    e.preventDefault()
                    const f = e.dataTransfer.files[0]
                    if (f) handleEnrichUpload(f)
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleEnrichUpload(f) }}
                  />
                  {enrichUploading
                    ? <p style={{ margin: 0, color: '#92400e', fontSize: 13, textAlign: 'center' }}>Επεξεργασία αρχείου...</p>
                    : enrichCount !== null
                      ? <p style={{ margin: 0, fontSize: 13, textAlign: 'center', color: enrichCount > 0 ? '#065f46' : '#92400e', fontWeight: 600 }}>
                          {enrichCount > 0
                            ? `✓ ${enrichCount} επαφ${enrichCount === 1 ? 'ή' : 'ές'} συμπληρώθηκ${enrichCount === 1 ? 'ε' : 'αν'} — ανεβάστε ξανά για να αλλάξετε`
                            : 'Δεν βρέθηκαν αντιστοιχίσεις. Ελέγξτε ότι η στήλη ΑΦΜ είναι σωστή.'}
                        </p>
                      : <p style={{ margin: 0, color: '#92400e', fontSize: 13, textAlign: 'center' }}>
                          📎 Σύρτε το συμπληρωμένο Excel εδώ ή <span style={{ textDecoration: 'underline' }}>κάντε κλικ για επιλογή</span>
                        </p>
                  }
                </div>
              </div>
            )}

            {/* Submit */}
            <div style={{ margin: '20px 0 0', textAlign: 'center' }}>
              <button
                onClick={handleContinue}
                disabled={selectedCount === 0 || submitting}
                style={{
                  background: selectedCount === 0 ? '#e5e7eb' : 'linear-gradient(135deg, #4f46e5, #6366f1)',
                  color: selectedCount === 0 ? '#9ca3af' : 'white',
                  border: 'none', borderRadius: 10, padding: '16px 40px',
                  fontSize: 16, fontWeight: 'bold', cursor: selectedCount === 0 ? 'default' : 'pointer',
                  width: '100%', maxWidth: 360,
                }}
              >
                {selectedCount === 0
                  ? 'Επιλέξτε τουλάχιστον έναν πελάτη'
                  : needsContactFill.length > 0
                    ? `Συνέχεια — ${selectedCount} πελάτ${selectedCount === 1 ? 'ης' : 'ες'} →`
                    : `Ανάθεση ${selectedCount} πελάτ${selectedCount === 1 ? 'η' : 'ών'} στην I-MENTOR →`
                }
              </button>
              {selectedCount > 0 && (
                <p style={{ color: '#6b7280', fontSize: 12, margin: '8px 0 0' }}>
                  {needsContactFill.length > 0
                    ? `${needsContactFill.length} από αυτούς χρειάζονται στοιχεία επικοινωνίας`
                    : 'Θα λάβετε ενημέρωση για κάθε υπόθεση'
                  }
                </p>
              )}
            </div>
          </>
        )}

        {step === 'fill-contacts' && (
          <>
            <div style={{ background: 'white', borderRadius: 12, margin: '16px 0 0', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
              <div style={{ padding: '16px 18px', borderBottom: '1px solid #e5e7eb', background: '#fffbeb' }}>
                <p style={{ margin: 0, fontWeight: 'bold', color: '#92400e', fontSize: 15 }}>
                  ⚠️ Προσθέστε στοιχεία επικοινωνίας
                </p>
                <p style={{ margin: '6px 0 0', color: '#78350f', fontSize: 13 }}>
                  Οι παρακάτω πελάτες δεν έχουν email ή τηλέφωνο. Συμπληρώστε τουλάχιστον ένα από τα δύο για να μπορέσουμε να επικοινωνήσουμε μαζί τους.
                </p>
              </div>
              {needsContactFill.map(b => (
                <div key={b.id} style={{ padding: '16px 18px', borderBottom: '1px solid #f3f4f6' }}>
                  <p style={{ margin: '0 0 10px', fontWeight: 600, color: '#111827', fontSize: 14 }}>
                    {b.onomasia || b.afm} <span style={{ color: '#9ca3af', fontWeight: 400 }}>ΑΦΜ: {b.afm}</span>
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Email</label>
                      <input
                        type="email"
                        value={contacts[b.id]?.email || ''}
                        onChange={e => setContacts(prev => ({ ...prev, [b.id]: { ...prev[b.id], email: e.target.value } }))}
                        placeholder="email@example.gr"
                        style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 7, padding: '8px 10px', fontSize: 14, boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Κινητό</label>
                      <input
                        type="tel"
                        value={contacts[b.id]?.phone || ''}
                        onChange={e => setContacts(prev => ({ ...prev, [b.id]: { ...prev[b.id], phone: e.target.value } }))}
                        placeholder="69XXXXXXXX"
                        style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 7, padding: '8px 10px', fontSize: 14, boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p style={{ color: '#6b7280', fontSize: 12, margin: '10px 0 16px', textAlign: 'center' }}>
              Αν δεν έχετε τα στοιχεία τώρα, αφήστε κενό — οι πελάτες αυτοί δεν θα ανατεθούν.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setStep('select')}
                style={{ flex: 1, background: 'white', border: '1px solid #d1d5db', color: '#374151', borderRadius: 10, padding: '14px', fontSize: 15, cursor: 'pointer' }}
              >
                ← Πίσω
              </button>
              <button
                onClick={submitSelections}
                disabled={submitting}
                style={{ flex: 2, background: 'linear-gradient(135deg, #4f46e5, #6366f1)', color: 'white', border: 'none', borderRadius: 10, padding: '14px', fontSize: 15, fontWeight: 'bold', cursor: 'pointer' }}
              >
                {submitting ? 'Αποστολή...' : 'Υποβολή ανάθεσης →'}
              </button>
            </div>
          </>
        )}

        {step === 'done' && result && (
          <div style={{ background: 'white', borderRadius: 12, margin: '20px 0 0', padding: '32px 24px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
            <p style={{ fontSize: 48, margin: '0 0 12px' }}>✅</p>
            <h2 style={{ color: '#111827', margin: '0 0 10px', fontSize: 20 }}>Η ανάθεση ολοκληρώθηκε!</h2>
            <p style={{ color: '#374151', fontSize: 15, margin: '0 0 8px' }}>
              {result.created === 0
                ? 'Δεν δημιουργήθηκαν νέες αναθέσεις — ίσως ήταν ήδη καταχωρημένες.'
                : `Η I-MENTOR θα επικοινωνήσει με ${result.created} πελάτ${result.created === 1 ? 'η' : 'ες'} σας.`
              }
            </p>
            {result.created > 0 && (
              <p style={{ color: '#6b7280', fontSize: 14, margin: '0 0 24px', lineHeight: 1.6 }}>
                Εφόσον ο πελάτης συμφωνήσει να προχωρήσει με το πρόγραμμα, θα σας ενημερώσουμε για κάθε επόμενο βήμα.
              </p>
            )}
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '14px 18px', textAlign: 'left' }}>
              <p style={{ margin: 0, color: '#166534', fontSize: 14, lineHeight: 1.6 }}>
                <strong>Τι γίνεται τώρα;</strong><br />
                Η ομάδα της I-MENTOR αναλαμβάνει την επικοινωνία με τους πελάτες σας, παρουσιάζει το πρόγραμμα και τους καθοδηγεί στα επόμενα βήματα. Εσείς παραμένετε ενήμεροι σε κάθε εξέλιξη.
              </p>
            </div>
            <p style={{ color: '#6b7280', fontSize: 13, margin: '20px 0 0' }}>
              Ερωτήσεις; Επικοινωνήστε μαζί μας: <a href="mailto:info@i-mentor.gr" style={{ color: '#4f46e5' }}>info@i-mentor.gr</a> · 2810363007
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
