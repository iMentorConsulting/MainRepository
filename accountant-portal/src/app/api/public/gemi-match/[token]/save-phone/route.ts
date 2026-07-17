import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function normalizePhone(raw: string): string | null {
  const stripped = raw.replace(/[\s\-().]/g, '')
  // Already in +30 6X form
  if (/^\+306[0-9]{9}$/.test(stripped)) return stripped
  // 0030 6X...
  if (/^00306[0-9]{9}$/.test(stripped)) return `+${stripped.slice(2)}`
  // 30 6X... (without leading +)
  if (/^306[0-9]{9}$/.test(stripped)) return `+${stripped}`
  // 6X... (just the mobile number)
  if (/^6[0-9]{9}$/.test(stripped)) return `+30${stripped}`
  return null
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const body = await req.json().catch(() => null)
  if (!body || typeof body.phone !== 'string' || !['ermis', 'themis'].includes(body.type)) {
    return NextResponse.json({ error: 'Μη έγκυρα δεδομένα' }, { status: 400 })
  }
  const { phone: rawPhone, type } = body as { phone: string; type: 'ermis' | 'themis' }

  // 1. Look up token
  const matchToken = await prisma.gemiMatchToken.findUnique({ where: { token } })
  if (!matchToken) return NextResponse.json({ error: 'Ο σύνδεσμος δεν βρέθηκε' }, { status: 404 })
  if (matchToken.expiresAt < new Date()) return NextResponse.json({ error: 'Ο σύνδεσμος έχει λήξει' }, { status: 410 })

  // 2. Look up GemiLookup
  const gemi = await prisma.gemiLookup.findUnique({
    where: { id: matchToken.gemiId },
    select: { id: true, onomasia: true, afm: true, email: true, mobilePhone: true, claimedBusinessId: true },
  })
  if (!gemi) return NextResponse.json({ error: 'Δεν βρέθηκαν στοιχεία επιχείρησης' }, { status: 404 })

  // 3. Normalize phone
  const normalizedPhone = normalizePhone(rawPhone)
  if (!normalizedPhone) {
    return NextResponse.json({ error: 'Μη έγκυρο κινητό τηλέφωνο' }, { status: 400 })
  }

  // 4 & 5. Save phone (skip if already saved)
  if (!gemi.mobilePhone) {
    await prisma.gemiLookup.update({
      where: { id: gemi.id },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { mobilePhone: normalizedPhone } as any,
    })

    if (gemi.claimedBusinessId) {
      await prisma.business.update({
        where: { id: gemi.claimedBusinessId },
        data: { viberPhone: normalizedPhone },
      })
    }
  }

  // 6. ΘΕΜΙΣ flow
  if (type === 'themis') {
    const apiKey = process.env.EXODIKASTIKOS_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'Η υπηρεσία δεν είναι διαθέσιμη αυτή τη στιγμή' }, { status: 503 })
    }

    const themisRes = await fetch('https://portal.i-mentor.gr/api/leads/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({
        name: gemi.onomasia ?? gemi.afm,
        phone: normalizedPhone,
        email: gemi.email ?? '',
        referrer: 'LOGISTIS Portal',
        application_number: `GEMI-${gemi.afm}`,
        send_themis: false,
      }),
    })

    if (!themisRes.ok) {
      const errText = await themisRes.text().catch(() => '')
      console.error('ΘΕΜΙΣ API error:', themisRes.status, errText)
      return NextResponse.json({ error: 'Σφάλμα σύνδεσης με τη Θέμις' }, { status: 502 })
    }

    const themisData = await themisRes.json()
    const themisUrl: string = themisData.themis_url
    if (!themisUrl) {
      return NextResponse.json({ error: 'Δεν ελήφθη σύνδεσμος από τη Θέμις' }, { status: 502 })
    }

    return NextResponse.json({ redirect: themisUrl })
  }

  // 7. ΕΡΜΗΣ flow
  return NextResponse.json({ redirect: `/gemi-match/${token}` })
}
