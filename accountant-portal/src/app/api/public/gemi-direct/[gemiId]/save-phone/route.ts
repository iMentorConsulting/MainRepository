import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function normalizePhone(raw: string): string | null {
  const stripped = raw.replace(/[\s\-().]/g, '')
  if (/^\+306[0-9]{9}$/.test(stripped)) return stripped
  if (/^00306[0-9]{9}$/.test(stripped)) return `+${stripped.slice(2)}`
  if (/^306[0-9]{9}$/.test(stripped)) return `+${stripped}`
  if (/^6[0-9]{9}$/.test(stripped)) return `+30${stripped}`
  return null
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ gemiId: string }> },
) {
  const { gemiId } = await params
  const body = await req.json().catch(() => null)
  if (!body || typeof body.phone !== 'string') {
    return NextResponse.json({ error: 'Μη έγκυρα δεδομένα' }, { status: 400 })
  }

  const gemi = await prisma.gemiLookup.findUnique({
    where: { id: gemiId },
    select: { id: true, onomasia: true, afm: true, email: true, mobilePhone: true, claimedBusinessId: true },
  })
  if (!gemi) return NextResponse.json({ error: 'Δεν βρέθηκαν στοιχεία' }, { status: 404 })

  const normalizedPhone = normalizePhone(body.phone)
  if (!normalizedPhone) {
    return NextResponse.json({ error: 'Μη έγκυρο κινητό τηλέφωνο' }, { status: 400 })
  }

  if (!gemi.mobilePhone) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await prisma.gemiLookup.update({ where: { id: gemi.id }, data: { mobilePhone: normalizedPhone } as any })
    if (gemi.claimedBusinessId) {
      await prisma.business.update({ where: { id: gemi.claimedBusinessId }, data: { viberPhone: normalizedPhone } })
    }
  }

  const themisBase = process.env.THEMIS_CREATE_URL || 'https://portal.i-mentor.gr/themis/create'
  const qs = new URLSearchParams({
    name: gemi.onomasia ?? gemi.afm,
    phone: normalizedPhone,
    referrer: 'LOGISTIS',
    application_number: `GEMI-${gemi.afm}`,
    send_themis: 'false',
  })
  if (gemi.email) qs.set('email', gemi.email)

  const themisUrl = `${themisBase}?${qs.toString()}`
  console.log(`[ΘΕΜΙΣ-DIRECT] Redirecting to: ${themisUrl}`)
  return NextResponse.json({ redirect: themisUrl })
}
