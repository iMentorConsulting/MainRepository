import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session || !['ADMIN', 'CONSULTANT'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  const business = await prisma.gemiLookup.findUnique({
    where: { id },
    include: {
      programMatches: {
        include: { program: { select: { id: true, title: true } } },
        orderBy: { matchScore: 'desc' },
      },
      campaignRecipients: {
        include: { campaign: { select: { id: true, title: true, channel: true, sentAt: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
    },
  })

  if (!business) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // If claimed, fetch the accountant name
  let claimedAccountant = null
  if (business.claimedAccountantId) {
    claimedAccountant = await prisma.accountant.findUnique({
      where: { id: business.claimedAccountantId },
      select: { officeName: true, contactPerson: true },
    })
  }

  return NextResponse.json({ ...business, claimedAccountant })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session || !['ADMIN', 'CONSULTANT'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json()

  const ALLOWED = ['onomasia', 'email', 'phone', 'postalAddress', 'postalAddressNo', 'postalZipCode', 'postalAreaDescription', 'category', 'tags'] as const
  const data: Record<string, unknown> = {}
  for (const key of ALLOWED) {
    if (key in body) data[key] = body[key]
  }
  if ('activities' in body && Array.isArray(body.activities)) {
    data.activities = body.activities
    // When KAD changes, reset matchingDone so the business gets re-matched
    data.matchingDone = false
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No editable fields provided' }, { status: 400 })
  }

  const updated = await prisma.gemiLookup.update({ where: { id }, data })
  return NextResponse.json(updated)
}
