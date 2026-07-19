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

  // 6. ΘΕΜΙΣ flow — direct redirect per the Eksodikastikos integration guide
  // (Option A): https://portal.i-mentor.gr/themis/create?... creates the lead,
  // assigns a consultant via round-robin, and drops the client straight into
  // the Θέμις chat. Seamless — no API round-trip, no Viber/Email interruption.
  if (type === 'themis') {
    const themisBase = process.env.THEMIS_CREATE_URL || 'https://portal.i-mentor.gr/themis/create'
    const qs = new URLSearchParams({
      name: gemi.onomasia ?? gemi.afm,
      phone: normalizedPhone,
      referrer: 'LOGISTIS',
      application_number: `GEMI-${gemi.afm}`,
    })
    if (gemi.email) qs.set('email', gemi.email)

    const themisUrl = `${themisBase}?${qs.toString()}`
    console.log(`[ΘΕΜΙΣ] Redirecting to: ${themisUrl}`)
    return NextResponse.json({ redirect: themisUrl })
  }

  // 7. ΕΡΜΗΣ flow
  return NextResponse.json({ redirect: `/gemi-match/${token}` })
}
