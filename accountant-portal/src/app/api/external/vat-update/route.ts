import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { lookupAfm } from '@/lib/gsis'
import { runMatchingForBusiness } from '@/lib/matching'

// Inbound webhook for the public "ΑΦΜ ΕΝΗΜΕΡΩΣΗ" lead-capture form (Bitform/Builder).
// Auth: header `x-api-key` must match env VAT_UPDATE_API_KEY.
// The form sends VAT, EMAIL, VIBER, REFERER as URL query parameters on a POST request.

function checkApiKey(request: NextRequest, body: any): boolean {
  const key = process.env.VAT_UPDATE_API_KEY
  if (!key) return false
  const headerKey = request.headers.get('x-api-key')
  const queryKey = request.nextUrl.searchParams.get('key') || request.nextUrl.searchParams.get('KEY')
  const bodyKey = body?.key || body?.KEY
  return headerKey === key || queryKey === key || bodyKey === key
}

function pick(searchParams: URLSearchParams, body: any, ...names: string[]): string {
  for (const name of names) {
    const fromQuery = searchParams.get(name)
    if (fromQuery) return fromQuery
    const fromBody = body?.[name]
    if (fromBody) return String(fromBody)
  }
  return ''
}

function normalizePhone(value: string | null): string | null {
  if (!value) return null
  let digits = value.replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('0030')) digits = digits.slice(4)
  else if (digits.startsWith('30') && digits.length > 10) digits = digits.slice(2)
  return digits || null
}

export async function POST(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const body = await request.json().catch(() => ({}))

  if (!checkApiKey(request, body)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const afm = pick(searchParams, body, 'VAT', 'vat', 'afm').replace(/\D/g, '')
  const email = pick(searchParams, body, 'EMAIL', 'email').trim() || null
  const viberPhone = normalizePhone(pick(searchParams, body, 'VIBER', 'viber') || null)
  const referer = pick(searchParams, body, 'REFERER', 'referer').trim() || null

  if (!afm || afm.length !== 9) {
    return NextResponse.json({ error: 'Μη έγκυρο ΑΦΜ' }, { status: 400 })
  }

  const existing = await prisma.business.findUnique({ where: { afm }, select: { id: true } })

  let business
  if (existing) {
    business = await prisma.business.update({
      where: { afm },
      data: {
        ...(email ? { email } : {}),
        ...(viberPhone ? { viberPhone } : {}),
      },
    })
  } else {
    let gsisData: any = null
    try {
      gsisData = await lookupAfm(afm)
    } catch {
      gsisData = null
    }

    business = await prisma.business.create({
      data: {
        afm,
        email,
        viberPhone,
        source: 'website-form',
        legalStatusDescr: gsisData?.legalStatusDescr || (gsisData ? null : 'ΙΔΙΩΤΗΣ'),
        onomasia: gsisData?.onomasia || null,
        commercialTitle: gsisData?.commercialTitle || null,
        regdate: gsisData?.regdate || null,
        postalAddress: gsisData?.postalAddress || null,
        postalAddressNo: gsisData?.postalAddressNo || null,
        postalZipCode: gsisData?.postalZipCode || null,
        postalAreaDescription: gsisData?.postalAreaDescription || null,
        doy: gsisData?.doy || null,
        doyDescr: gsisData?.doyDescr || null,
        notes: referer ? `Εγγραφή μέσω φόρμας website (referer: ${referer})` : 'Εγγραφή μέσω φόρμας website',
        activities: gsisData?.activities?.length ? {
          create: gsisData.activities.map((a: any) => ({
            firmActCode: a.firmActCode,
            firmActDescr: a.firmActDescr,
            firmActKind: a.firmActKind ? parseInt(String(a.firmActKind)) : null,
            firmActKindDescr: a.firmActKindDescr,
          }))
        } : undefined,
      },
    })
  }

  runMatchingForBusiness(business.id).catch(err => console.error('[VAT webhook] matching failed:', err?.message))

  return NextResponse.json({ success: true, businessId: business.id, created: !existing })
}
