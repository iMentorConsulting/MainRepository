import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { runMatchingForBusiness } from '@/lib/matching'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session || !['ADMIN', 'CONSULTANT', 'ACCOUNTANT'].includes(session.user.role)) {
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
    // Check if the existing claimed business has no accountant (auto-created by
    // Ερμής GEMI chat). In that case allow re-claiming so it can be assigned.
    const existingBusiness = await prisma.business.findUnique({
      where: { id: gemiLookup.claimedBusinessId },
      select: { accountantId: true },
    })
    if (!existingBusiness || existingBusiness.accountantId !== null) {
      return NextResponse.json(
        { error: 'Αυτή η επιχείρηση έχει ήδη ανατεθεί' },
        { status: 409 }
      )
    }
    // existingBusiness has no accountant — fall through to assign it
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
    // Link existing business — fill in missing email/phone/accountantId from GemiLookup
    const updateData: Record<string, any> = {}
    if (!business.email && gemiLookup.email) updateData.email = gemiLookup.email
    if (!business.phone && gemiLookup.phone) updateData.phone = gemiLookup.phone
    if (!business.accountantId && accountantId) updateData.accountantId = accountantId
    if (!business.tags.includes('ΓΕΜΗ')) updateData.tags = { push: 'ΓΕΜΗ' }

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
        deactivationFlag: gemiLookup.deactivationFlag ?? undefined,
        stopDate: gemiLookup.stopDate ?? undefined,
        source: 'gemi-claim',
        tags: ['ΓΕΜΗ'],
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

  // Auto-run matching for the newly claimed business
  runMatchingForBusiness(business.id).catch(err =>
    console.error('[GemiClaim] auto-matching failed:', err instanceof Error ? err.message : err)
  )

  return NextResponse.json({
    business: {
      id: business.id,
      afm: business.afm,
      onomasia: business.onomasia,
    },
  })
}
