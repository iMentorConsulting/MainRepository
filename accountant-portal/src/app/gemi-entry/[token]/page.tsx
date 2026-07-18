'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'

export default function GemiEntryPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const token = params.token as string
  const type = searchParams.get('type') ?? 'ermis'

  const [businessName, setBusinessName] = useState<string>('')
  const [phone, setPhone] = useState('')
  const [phoneError, setPhoneError] = useState('')
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState('')

  useEffect(() => {
    fetch(`/api/public/gemi-match/${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.business?.name) setBusinessName(data.business.name)
        else setFetchError('Ο σύνδεσμος δεν βρέθηκε ή έχει λήξει.')
      })
      .catch(() => setFetchError('Σφάλμα σύνδεσης. Παρακαλώ δοκιμάστε ξανά.'))
  }, [token])

  function validatePhone(value: string): boolean {
    const stripped = value.replace(/[\s\-().]/g, '')
    // Accept +30 6X..., 0030 6X..., 69..., 6X...
    return /^(\+30|0030)?6[0-9]{9}$/.test(stripped)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPhoneError('')
    if (!validatePhone(phone)) {
      setPhoneError('Παρακαλώ εισάγετε έγκυρο ελληνικό κινητό τηλέφωνο (π.χ. +30 694 XXX XXXX)')
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/public/gemi-match/${token}/save-phone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, type }),
      })
      let data: any = {}
      try { data = await res.json() } catch { /* non-JSON response */ }
      if (!res.ok) {
        setPhoneError(data.error ?? `Σφάλμα ${res.status}. Παρακαλώ δοκιμάστε ξανά.`)
        setLoading(false)
        return
      }
      if (!data.redirect) {
        setPhoneError('Δεν ελήφθη σύνδεσμος. Παρακαλώ δοκιμάστε ξανά.')
        setLoading(false)
        return
      }
      window.location.href = data.redirect
    } catch (err) {
      setPhoneError('Σφάλμα σύνδεσης. Παρακαλώ δοκιμάστε ξανά.')
      console.error('save-phone error:', err)
      setLoading(false)
    }
  }

  const isErmis = type === 'ermis'
  const chatLabel = isErmis
    ? 'Συνδεθείτε με τον Ερμή — Δωρεάν έλεγχος επιλεξιμότητας'
    : 'Συνδεθείτε με τη Θέμις — Εξωδικαστικός Μηχανισμός'

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #1a3a6b 0%, #2563eb 60%, #1e40af 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ background: '#fff', borderRadius: '16px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)', maxWidth: '480px', width: '100%', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, #1a3a6b 0%, #2563eb 100%)', padding: '28px 24px 20px', textAlign: 'center' }}>
          <img
            src="https://i-mentor.gr/wp-content/uploads/2026/06/logo-white-transparent.png"
            alt="i-Mentor Consulting"
            style={{ height: '48px', maxWidth: '180px', objectFit: 'contain', display: 'block', margin: '0 auto 8px' }}
          />
          <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '13px' }}>
            Σύμβουλοι Επιχειρήσεων
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '32px 28px' }}>
          {fetchError ? (
            <div style={{ textAlign: 'center', color: '#dc2626', fontSize: '15px' }}>{fetchError}</div>
          ) : (
            <>
              {businessName && (
                <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                  <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>Επιχείρηση</div>
                  <div style={{ fontSize: '17px', fontWeight: 700, color: '#1a3a6b' }}>{businessName}</div>
                </div>
              )}

              <div style={{ background: '#eff6ff', borderRadius: '10px', padding: '14px 16px', marginBottom: '28px', borderLeft: '4px solid #2563eb' }}>
                <div style={{ fontSize: '15px', fontWeight: 600, color: '#1e40af', lineHeight: 1.4 }}>{chatLabel}</div>
              </div>

              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>
                    Κινητό τηλέφωνο επικοινωνίας
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value); setPhoneError('') }}
                    placeholder="+30 69X XXX XXXX"
                    required
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      fontSize: '16px',
                      border: phoneError ? '2px solid #dc2626' : '2px solid #d1d5db',
                      borderRadius: '8px',
                      outline: 'none',
                      boxSizing: 'border-box',
                      transition: 'border-color 0.15s',
                    }}
                    onFocus={(e) => { if (!phoneError) e.target.style.borderColor = '#2563eb' }}
                    onBlur={(e) => { if (!phoneError) e.target.style.borderColor = '#d1d5db' }}
                  />
                  {phoneError && (
                    <div style={{ marginTop: '6px', fontSize: '13px', color: '#dc2626' }}>{phoneError}</div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading || !businessName}
                  style={{
                    width: '100%',
                    padding: '14px',
                    background: loading ? '#93c5fd' : 'linear-gradient(135deg, #1a3a6b, #2563eb)',
                    color: '#fff',
                    fontSize: '16px',
                    fontWeight: 700,
                    border: 'none',
                    borderRadius: '8px',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    transition: 'opacity 0.15s',
                  }}
                >
                  {loading ? 'Παρακαλώ περιμένετε...' : 'Συνέχεια →'}
                </button>
              </form>

              <div style={{ marginTop: '20px', fontSize: '12px', color: '#9ca3af', textAlign: 'center', lineHeight: 1.5 }}>
                Τα στοιχεία σας χρησιμοποιούνται αποκλειστικά για την επικοινωνία σχετικά με το πρόγραμμά σας.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
