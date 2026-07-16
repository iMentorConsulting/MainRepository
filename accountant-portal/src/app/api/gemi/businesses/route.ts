import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Maps each Greek region to its 2-digit postal zip prefixes
const REGION_ZIP_PREFIXES: Record<string, string[]> = {
  'Αττική': ['10','11','12','13','14','15','16','17','18','19'],
  'Πελοπόννησος': ['20','21','22','23','24'],
  'Δυτική Ελλάδα': ['25','26','27'],
  'Ιόνια Νησιά': ['28','29','49'],
  'Στερεά Ελλάδα': ['30','31','32','33','34','35','36'],
  'Θεσσαλία': ['37','38','39','40','41','42','43'],
  'Ήπειρος': ['44','45','46','47','48'],
  'Δυτική Μακεδονία': ['50','51','52','53'],
  'Κεντρική Μακεδονία': ['54','55','56','57','58','59','60','61','62','63'],
  'Ανατολική Μακεδονία και Θράκη': ['64','65','66','67','68','69'],
  'Κρήτη': ['70','71','72','73','74'],
  'Βόρειο Αιγαίο': ['81','82','83'],
  'Νότιο Αιγαίο': ['84','85'],
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)

  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10) || 50))
  const search = searchParams.get('search')?.trim() ?? ''
  const aadeEnrichedParam = searchParams.get('aadeEnriched')   // yes | no
  const matchingDoneParam = searchParams.get('matchingDone')   // yes | no
  const claimedParam = searchParams.get('claimed')             // yes | no
  const importBatch = searchParams.get('importBatch')?.trim() ?? ''
  const regionParam = searchParams.get('region')?.trim() ?? ''
  const categoryParam = searchParams.get('category')?.trim() ?? ''
  const hasCampaignParam = searchParams.get('hasCampaign')     // yes | no
  const activeParam = searchParams.get('active')               // yes | no

  const where: Record<string, unknown> = {}

  if (search) {
    where.OR = [
      { afm: { contains: search, mode: 'insensitive' } },
      { onomasia: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
    ]
  }

  if (aadeEnrichedParam === 'yes') where.aadeEnriched = true
  else if (aadeEnrichedParam === 'no') where.aadeEnriched = false

  if (matchingDoneParam === 'yes') where.matchingDone = true
  else if (matchingDoneParam === 'no') where.matchingDone = false

  if (claimedParam === 'yes') where.claimedBusinessId = { not: null }
  else if (claimedParam === 'no') where.claimedBusinessId = null

  if (importBatch) where.importBatch = importBatch

  if (regionParam && REGION_ZIP_PREFIXES[regionParam]) {
    const prefixes = REGION_ZIP_PREFIXES[regionParam]
    where.OR = [
      ...(Array.isArray(where.OR) ? where.OR : []),
      ...prefixes.map(p => ({ postalZipCode: { startsWith: p } })),
    ]
    // If we also have a search OR, we need AND logic; wrap both in AND
    if (search) {
      where.AND = [
        { OR: where.OR as object[] },
        { OR: prefixes.map(p => ({ postalZipCode: { startsWith: p } })) },
      ]
      delete where.OR
    } else {
      where.OR = prefixes.map(p => ({ postalZipCode: { startsWith: p } }))
    }
  }

  if (categoryParam) where.category = categoryParam

  if (hasCampaignParam === 'yes') where.campaignRecipients = { some: {} }
  else if (hasCampaignParam === 'no') where.campaignRecipients = { none: {} }

  if (activeParam === 'yes') where.stopDate = null
  else if (activeParam === 'no') where.stopDate = { not: null }

  const skip = (page - 1) * limit

  const [businesses, total] = await Promise.all([
    prisma.gemiLookup.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { programMatches: true, campaignRecipients: true },
        },
      },
    }),
    prisma.gemiLookup.count({ where }),
  ])

  const pages = Math.ceil(total / limit)

  return NextResponse.json({
    businesses,
    total,
    page,
    pages,
    meta: { total, page, pageSize: limit, totalPages: pages },
  })
}
