import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { claimGemiLookup } from '@/lib/gemi-claim'

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

  const business = await claimGemiLookup(gemiLookup, accountantId)

  return NextResponse.json({
    business: {
      id: business.id,
      afm: business.afm,
      onomasia: business.onomasia,
    },
  })
}
