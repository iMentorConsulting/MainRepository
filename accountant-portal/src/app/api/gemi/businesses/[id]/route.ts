import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { loadActivePrograms, runMatchingForGemi } from '@/lib/gemi-matching'

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
        include: { program: { select: { id: true, title: true, category: true } } },
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

  // Ad-hoc sends (program-info email, microcredits eligibility analysis,
  // "Ενημέρωση & Επόμενα Βήματα") aren't formal Campaign sends, so they
  // don't come through campaignRecipients. MessageLog.businessId isn't set
  // for an unclaimed lead (only once claimed), so match by ΑΦΜ instead —
  // same identity every send for this lead already uses.
  const messageLogs = await prisma.messageLog.findMany({
    where: { afm: business.afm },
    orderBy: { createdAt: 'desc' },
    take: 100,
  }).catch(() => [])

  // If this lead was later claimed into a real Business, formal Campaign
  // sends to it afterward live in campaignRecipients (businessId-keyed) —
  // a separate table from this lead's own campaignRecipients (gemiId-keyed)
  // — so pull those in too, same reasoning as messageLogs above.
  const claimedBusinessCampaignRecipients = business.claimedBusinessId
    ? await prisma.campaignRecipient.findMany({
        where: { businessId: business.claimedBusinessId },
        include: { campaign: { select: { id: true, title: true, channel: true } } },
        orderBy: { sentAt: 'desc' },
        take: 100,
      }).catch(() => [])
    : []

  return NextResponse.json({ ...business, claimedAccountant, messageLogs, claimedBusinessCampaignRecipients })
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

  // Any field the matcher reads (tags, ΤΚ, activities, etc.) must trigger a
  // rematch immediately — otherwise a manually added tag leaves stale
  // matches that only get re-evaluated on the next program edit/cron pass.
  const matchingRelevantFields = ['tags', 'postalZipCode', 'activities']
  if (matchingRelevantFields.some(f => f in data)) {
    ;(async () => {
      const programs = await loadActivePrograms()
      await runMatchingForGemi(id, programs)
    })().catch(err => console.error('[GemiBusinesses] rematch after edit failed:', err?.message))
  }

  return NextResponse.json(updated)
}
