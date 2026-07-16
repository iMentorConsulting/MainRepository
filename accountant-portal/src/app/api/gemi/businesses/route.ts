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

// KAD code prefix ranges by category (first 2 digits of firmActCode)
// These are broad approximations used when category field is not yet populated
const CATEGORY_KAD_PREFIXES: Record<string, string[]> = {
  'ΤΟΥΡΙΣΜΟΣ': ['55'],
  'ΕΣΤΙΑΣΗ': ['56'],
  'ΕΜΠΟΡΙΟ': ['45','46','47'],
  'ΜΕΤΑΠΟΙΗΣΗ': ['10','11','12','13','14','15','16','17','18','19','20','21','22','23','24','25','26','27','28','29','30','31','32','33'],
  'ΑΓΡΟΤΙΚΑ': ['01','02','03'],
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

  // Build AND array so filters compose correctly
  const andClauses: object[] = []

  if (search) {
    andClauses.push({
      OR: [
        { afm: { contains: search, mode: 'insensitive' } },
        { onomasia: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ],
    })
  }

  if (aadeEnrichedParam === 'yes') andClauses.push({ aadeEnriched: true })
  else if (aadeEnrichedParam === 'no') andClauses.push({ aadeEnriched: false })

  if (matchingDoneParam === 'yes') andClauses.push({ matchingDone: true })
  else if (matchingDoneParam === 'no') andClauses.push({ matchingDone: false })

  if (claimedParam === 'yes') andClauses.push({ claimedBusinessId: { not: null } })
  else if (claimedParam === 'no') andClauses.push({ claimedBusinessId: null })

  if (importBatch) andClauses.push({ importBatch })

  if (regionParam && REGION_ZIP_PREFIXES[regionParam]) {
    const prefixes = REGION_ZIP_PREFIXES[regionParam]
    andClauses.push({ OR: prefixes.map(p => ({ postalZipCode: { startsWith: p } })) })
  }

  if (categoryParam) {
    // Try exact match on stored category field first; also fall back to KAD prefix scan
    const kadPrefixes = CATEGORY_KAD_PREFIXES[categoryParam]
    if (kadPrefixes) {
      andClauses.push({
        OR: [
          { category: categoryParam },
          // Fallback: match primary KAD code prefix for records not yet enriched with category
          ...kadPrefixes.map(p => ({
            activities: {
              path: ['$[0]', 'firmActCode'],
              string_starts_with: p,
            },
          })),
        ],
      })
    } else {
      // ΥΠΗΡΕΣΙΕΣ = everything else — only match by stored field
      andClauses.push({ category: categoryParam })
    }
  }

  if (hasCampaignParam === 'yes') andClauses.push({ campaignRecipients: { some: {} } })
  else if (hasCampaignParam === 'no') andClauses.push({ campaignRecipients: { none: {} } })

  if (activeParam === 'yes') andClauses.push({ stopDate: null })
  else if (activeParam === 'no') andClauses.push({ stopDate: { not: null } })

  const where = andClauses.length > 0 ? { AND: andClauses } : {}

  const skip = (page - 1) * limit

  const [businesses, total] = await Promise.all([
    prisma.gemiLookup.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        afm: true,
        onomasia: true,
        email: true,
        phone: true,
        importBatch: true,
        importedAt: true,
        aadeEnriched: true,
        matchingDone: true,
        claimedAt: true,
        claimedBusinessId: true,
        claimedAccountantId: true,
        category: true,
        activities: true,
        postalAreaDescription: true,
        postalZipCode: true,
        stopDate: true,
      },
    }),
    prisma.gemiLookup.count({ where }),
  ])

  // Resolve accountant names for claimed records
  const accountantIds = [...new Set(businesses.map(b => b.claimedAccountantId).filter(Boolean))] as string[]
  const accountants = accountantIds.length > 0
    ? await prisma.accountant.findMany({
        where: { id: { in: accountantIds } },
        select: { id: true, officeName: true, contactPerson: true },
      })
    : []
  const accountantMap = Object.fromEntries(accountants.map(a => [a.id, a.officeName || a.contactPerson || '']))

  const enriched = businesses.map(b => ({
    ...b,
    claimed: !!b.claimedBusinessId,
    claimedBy: b.claimedAccountantId ? (accountantMap[b.claimedAccountantId] ?? null) : null,
  }))

  const pages = Math.ceil(total / limit)

  return NextResponse.json({
    businesses: enriched,
    total,
    page,
    pages,
    meta: { total, page, pageSize: limit, totalPages: pages },
  })
}
