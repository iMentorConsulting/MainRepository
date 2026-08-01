import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

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

// Maps each Greek νομός to its 2-digit postal zip prefixes
const NOMOS_ZIP_PREFIXES: Record<string, string[]> = {
  'Ν. Αθηνών':                ['10','11','12','14','15','16','17'],
  'Ν. Πειραιώς':              ['18'],
  'Ν. Ανατολικής Αττικής':    ['19'],
  'Ν. Δυτικής Αττικής':       ['13'],
  'Ν. Κορινθίας':             ['20'],
  'Ν. Αργολίδας':             ['21'],
  'Ν. Αρκαδίας':              ['22'],
  'Ν. Λακωνίας':              ['23'],
  'Ν. Μεσσηνίας':             ['24'],
  'Ν. Αχαΐας':                ['25','26'],
  'Ν. Ηλείας':                ['27'],
  'Ν. Κεφαλληνίας':           ['28'],
  'Ν. Ζακύνθου':              ['29'],
  'Ν. Αιτωλοακαρνανίας':      ['30','31'],
  'Ν. Βοιωτίας':              ['32'],
  'Ν. Φωκίδας':               ['33'],
  'Ν. Εύβοιας':               ['34'],
  'Ν. Φθιώτιδας':             ['35'],
  'Ν. Ευρυτανίας':            ['36'],
  'Ν. Μαγνησίας':             ['37','38','39'],
  'Ν. Λάρισας':               ['40','41'],
  'Ν. Τρικάλων':              ['42'],
  'Ν. Καρδίτσας':             ['43'],
  'Ν. Ιωαννίνων':             ['44','45'],
  'Ν. Θεσπρωτίας':            ['46'],
  'Ν. Άρτας':                 ['47'],
  'Ν. Πρέβεζας':              ['48'],
  'Ν. Κερκύρας':              ['49'],
  'Ν. Κοζάνης':               ['50'],
  'Ν. Γρεβενών':              ['51'],
  'Ν. Καστοριάς':             ['52'],
  'Ν. Φλώρινας':              ['53'],
  'Ν. Θεσσαλονίκης':          ['54','55','56','57'],
  'Ν. Πέλλας':                ['58'],
  'Ν. Ημαθίας':               ['59'],
  'Ν. Πιερίας':               ['60'],
  'Ν. Κιλκίς':                ['61'],
  'Ν. Σερρών':                ['62','64'],
  'Ν. Χαλκιδικής':            ['63'],
  'Ν. Καβάλας':               ['65'],
  'Ν. Δράμας':                ['66'],
  'Ν. Ξάνθης':                ['67'],
  'Ν. Ροδόπης':               ['68'],
  'Ν. Έβρου':                 ['69'],
  'Ν. Ηρακλείου':             ['70','71'],
  'Ν. Λασιθίου':              ['72'],
  'Ν. Χανίων':                ['73'],
  'Ν. Ρεθύμνου':              ['74'],
  'Ν. Λέσβου':                ['81'],
  'Ν. Χίου':                  ['82'],
  'Ν. Σάμου':                 ['83'],
  'Ν. Κυκλάδων':              ['84'],
  'Ν. Δωδεκανήσου':           ['85'],
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
  if (!session || !['ADMIN', 'CONSULTANT'].includes(session.user.role)) {
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
  const nomosParam = searchParams.get('nomos')?.trim() ?? ''
  const citiesParam = searchParams.getAll('cities').filter(Boolean)
  const categoryParam = searchParams.get('category')?.trim() ?? ''
  const hasCampaignParam = searchParams.get('hasCampaign')     // yes | no
  const activeParam = searchParams.get('active')               // yes | no
  // Email engagement filter: opened | not_opened | clicked | bounced | unsubscribed
  const emailEngagementParam = searchParams.get('emailEngagement')?.trim() ?? ''
  // KAD code multi-filter: one or more firmActCode values (repeating params)
  const kadCodes = searchParams.getAll('kadCodes').filter(Boolean)
  // Tag multi-filter: one or more tag values
  const tagsFilter = searchParams.getAll('tags').filter(Boolean)
  // Tag exclude filter: businesses that have ANY of these tags are excluded
  const tagsExclude = searchParams.getAll('tagsExclude').filter(Boolean)

  // Build AND array so filters compose correctly
  const andClauses: object[] = []

  if (search) {
    // Also search KAD descriptions via raw SQL (Prisma can't do case-insensitive on Json)
    const kadRows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT id FROM "GemiLookup",
      jsonb_array_elements(activities::jsonb) AS elem
      WHERE LOWER(elem->>'firmActDescr') LIKE LOWER(${`%${search}%`})
        OR LOWER(elem->>'firmActCode') LIKE LOWER(${`%${search}%`})
    `
    const kadMatchIds = kadRows.map(r => r.id)
    andClauses.push({
      OR: [
        { afm: { contains: search, mode: 'insensitive' } },
        { onomasia: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        ...(kadMatchIds.length > 0 ? [{ id: { in: kadMatchIds } }] : []),
      ],
    })
  }

  if (kadCodes.length > 0) {
    const idList = kadCodes.map(code => Prisma.sql`${code}`)
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT gl.id
      FROM "GemiLookup" gl,
      jsonb_array_elements(gl.activities::jsonb) AS elem
      WHERE elem->>'firmActCode' = ANY(ARRAY[${Prisma.join(idList)}])
    `
    andClauses.push({ id: { in: rows.map(r => r.id) } })
  }

  if (tagsFilter.length > 0) {
    andClauses.push({ tags: { hasSome: tagsFilter } })
  }

  if (tagsExclude.length > 0) {
    andClauses.push({ NOT: { tags: { hasSome: tagsExclude } } })
  }

  if (aadeEnrichedParam === 'yes') andClauses.push({ aadeEnriched: true })
  else if (aadeEnrichedParam === 'no') andClauses.push({ aadeEnriched: false })

  if (matchingDoneParam === 'yes') andClauses.push({ matchingDone: true })
  else if (matchingDoneParam === 'no') andClauses.push({ matchingDone: false })

  if (claimedParam === 'yes') andClauses.push({ claimedBusinessId: { not: null } })
  else if (claimedParam === 'no') andClauses.push({ claimedBusinessId: null })

  if (importBatch) andClauses.push({ importBatch })

  if (citiesParam.length > 0) {
    andClauses.push({ postalAreaDescription: { in: citiesParam } })
  }

  if (regionParam && REGION_ZIP_PREFIXES[regionParam]) {
    const prefixes = REGION_ZIP_PREFIXES[regionParam]
    andClauses.push({ OR: prefixes.map(p => ({ postalZipCode: { startsWith: p } })) })
  }

  if (nomosParam && NOMOS_ZIP_PREFIXES[nomosParam]) {
    const prefixes = NOMOS_ZIP_PREFIXES[nomosParam]
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

  if (emailEngagementParam === 'opened') {
    andClauses.push({ campaignRecipients: { some: { channel: 'EMAIL', openedAt: { not: null } } } })
  } else if (emailEngagementParam === 'not_opened') {
    // Sent but no open AND no click (a click implies the email was read even if the
    // tracking pixel was blocked by the recipient's email client), and not bounced
    andClauses.push({ campaignRecipients: { some: { channel: 'EMAIL', status: 'sent', openedAt: null, clickedAt: null, bouncedAt: null } } })
  } else if (emailEngagementParam === 'clicked') {
    andClauses.push({ campaignRecipients: { some: { channel: 'EMAIL', clickedAt: { not: null } } } })
  } else if (emailEngagementParam === 'bounced') {
    andClauses.push({ campaignRecipients: { some: { channel: 'EMAIL', bouncedAt: { not: null } } } })
  } else if (emailEngagementParam === 'unsubscribed') {
    andClauses.push({ campaignRecipients: { some: { channel: 'EMAIL', unsubscribedAt: { not: null } } } })
  }

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
        createdAt: true,
        aadeEnriched: true,
        matchingDone: true,
        claimedAt: true,
        claimedBusinessId: true,
        claimedAccountantId: true,
        category: true,
        activities: true,
        tags: true,
        postalAreaDescription: true,
        postalZipCode: true,
        stopDate: true,
      },
    }),
    prisma.gemiLookup.count({ where }),
  ])

  // Resolve accountant names for claimed records
  const accountantIds = Array.from(new Set(businesses.map(b => b.claimedAccountantId).filter((x): x is string => !!x)))
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
