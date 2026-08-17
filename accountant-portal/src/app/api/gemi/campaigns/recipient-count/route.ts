import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const channel = searchParams.get('channel') ?? 'EMAIL'
  const programId = searchParams.get('programId') || null
  const requireProgramId2 = searchParams.get('requireProgramId2') || null
  const importBatch = searchParams.get('importBatch') || null
  const region = searchParams.get('region') || null
  const category = searchParams.get('category') || null
  const hasReceivedCampaign = searchParams.get('hasReceivedCampaign') || null
  const tags = searchParams.getAll('tags').filter(Boolean)
  const excludeTags = searchParams.getAll('excludeTags').filter(Boolean)

  // Use relation filters (EXISTS subqueries) instead of id IN (...) to avoid
  // PostgreSQL's 32767 bind-variable limit when the match list is large.
  const baseWhere: Record<string, unknown> = { unsubscribedAt: null }

  if (programId) {
    const mustMatch: string[] = [programId]
    if (requireProgramId2) mustMatch.push(requireProgramId2)
    const programFilters = mustMatch.map(pid => ({
      programMatches: { some: { programId: pid, status: { not: 'REJECTED' } } },
    }))
    if (programFilters.length === 1) {
      baseWhere.programMatches = programFilters[0].programMatches
    } else {
      baseWhere.AND = programFilters
    }
  }

  if (importBatch) baseWhere.importBatch = importBatch
  if (region) baseWhere.postalAreaDescription = region
  if (category) baseWhere.category = category
  if (tags.length > 0) baseWhere.tags = { hasSome: tags }
  if (excludeTags.length > 0) baseWhere.NOT = { tags: { hasSome: excludeTags } }
  if (hasReceivedCampaign === 'true') baseWhere.campaignRecipients = { some: { status: 'sent' } }
  if (hasReceivedCampaign === 'false') baseWhere.campaignRecipients = { none: { status: 'sent' } }

  let emailCount = 0
  let viberCount = 0

  if (channel === 'EMAIL' || channel === 'EMAIL_AND_VIBER') {
    emailCount = await prisma.gemiLookup.count({
      where: { ...baseWhere, email: { not: null } },
    })
  }
  if (channel === 'VIBER' || channel === 'EMAIL_AND_VIBER') {
    viberCount = await prisma.gemiLookup.count({
      where: { ...baseWhere, phone: { not: null } },
    })
  }

  return NextResponse.json({ emailCount, viberCount, total: emailCount + viberCount })
}
