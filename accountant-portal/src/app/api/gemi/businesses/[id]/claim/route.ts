import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'ACCOUNTANT')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const gemiLookup = await prisma.gemiLookup.findUnique({
    where: { id },
  })

  if (!gemiLookup) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (gemiLookup.claimedBusinessId !== null) {
    return NextResponse.json(
      { error: 'Αυτή η επιχείρηση έχει ήδη ανατεθεί' },
      { status: 409 }
    )
  }

  let accountantId: string | null = null

  if (session.user.role === 'ACCOUNTANT') {
    accountantId = session.user.accountantId ?? null
  } else {
    // ADMIN: read accountantId from body
    try {
      const body = await request.json()
      accountantId = body.accountantId ?? null
    } catch {
      accountantId = null
    }
  }

  const activities: Array<{
    firmActCode: string
    firmActDescr?: string
    firmActKind?: number
    firmActKindDescr?: string
  }> = Array.isArray(gemiLookup.activities) ? (gemiLookup.activities as any[]) : []

  let business = await prisma.business.findUnique({
    where: { afm: gemiLookup.afm },
  })

  if (business) {
    // Link existing business — fill in missing email/phone from GemiLookup
    const updateData: Record<string, string> = {}
    if (!business.email && gemiLookup.email) updateData.email = gemiLookup.email
    if (!business.phone && gemiLookup.phone) updateData.phone = gemiLookup.phone

    if (Object.keys(updateData).length > 0) {
      business = await prisma.business.update({
        where: { id: business.id },
        data: updateData,
      })
    }
  } else {
    // Create new Business from GemiLookup data
    business = await prisma.business.create({
      data: {
        afm: gemiLookup.afm,
        onomasia: gemiLookup.onomasia ?? undefined,
        email: gemiLookup.email ?? undefined,
        phone: gemiLookup.phone ?? undefined,
        legalStatusDescr: gemiLookup.legalStatusDescr ?? undefined,
        postalAddress: gemiLookup.postalAddress ?? undefined,
        postalAddressNo: gemiLookup.postalAddressNo ?? undefined,
        postalZipCode: gemiLookup.postalZipCode ?? undefined,
        postalAreaDescription: gemiLookup.postalAreaDescription ?? undefined,
        doy: gemiLookup.doy ?? undefined,
        doyDescr: gemiLookup.doyDescr ?? undefined,
        regdate: gemiLookup.regdate ?? undefined,
        source: 'gemi-claim',
        accountantId: accountantId ?? undefined,
      },
    })
  }

  // Upsert activities into BusinessActivity
  if (activities.length > 0) {
    for (const act of activities) {
      if (!act.firmActCode) continue
      const existing = await prisma.businessActivity.findFirst({
        where: { businessId: business.id, firmActCode: act.firmActCode },
      })
      if (!existing) {
        await prisma.businessActivity.create({
          data: {
            businessId: business.id,
            firmActCode: act.firmActCode,
            firmActDescr: act.firmActDescr ?? undefined,
            firmActKind: act.firmActKind ?? undefined,
            firmActKindDescr: act.firmActKindDescr ?? undefined,
          },
        })
      }
    }
  }

  // Update GemiLookup claim fields
  await prisma.gemiLookup.update({
    where: { id },
    data: {
      claimedBusinessId: business.id,
      claimedAccountantId: accountantId,
      claimedAt: new Date(),
    },
  })

  return NextResponse.json({
    business: {
      id: business.id,
      afm: business.afm,
      onomasia: business.onomasia,
    },
  })
}
