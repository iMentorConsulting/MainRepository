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

  // ── Raw-SQL WHERE builder ───────────────────────────────────────────────────
  // We always use the raw-SQL path to avoid Prisma's id IN ([N ids]) pattern
  // which crashes with P2035 when N > 32767 bind variables.
  const rawConds: Prisma.Sql[] = []

  if (search) {
    const s = `%${search}%`
    rawConds.push(Prisma.sql`(
      gl.afm ILIKE ${s}
      OR gl.onomasia ILIKE ${s}
      OR gl.email ILIKE ${s}
      OR gl.phone ILIKE ${s}
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(gl.activities::jsonb) AS elem
        WHERE LOWER(elem->>'firmActDescr') LIKE LOWER(${s})
           OR LOWER(elem->>'firmActCode') LIKE LOWER(${s})
      )
    )`)
  }

  if (kadCodes.length > 0) {
    const codeList = kadCodes.map(c => Prisma.sql`${c}`)
    rawConds.push(Prisma.sql`EXISTS (
      SELECT 1 FROM jsonb_array_elements(gl.activities::jsonb) AS elem
      WHERE elem->>'firmActCode' = ANY(ARRAY[${Prisma.join(codeList)}])
    )`)
  }

  if (tagsFilter.length > 0) {
    const tList = tagsFilter.map(t => Prisma.sql`${t}`)
    rawConds.push(Prisma.sql`gl.tags && ARRAY[${Prisma.join(tList)}]::text[]`)
  }

  if (tagsExclude.length > 0) {
    const tList = tagsExclude.map(t => Prisma.sql`${t}`)
    rawConds.push(Prisma.sql`NOT (gl.tags && ARRAY[${Prisma.join(tList)}]::text[])`)
  }

  if (aadeEnrichedParam === 'yes') rawConds.push(Prisma.sql`gl."aadeEnriched" = true`)
  else if (aadeEnrichedParam === 'no') rawConds.push(Prisma.sql`gl."aadeEnriched" = false`)

  if (matchingDoneParam === 'yes') rawConds.push(Prisma.sql`gl."matchingDone" = true`)
  else if (matchingDoneParam === 'no') rawConds.push(Prisma.sql`gl."matchingDone" = false`)

  if (claimedParam === 'yes') rawConds.push(Prisma.sql`gl."claimedBusinessId" IS NOT NULL`)
  else if (claimedParam === 'no') rawConds.push(Prisma.sql`gl."claimedBusinessId" IS NULL`)

  if (importBatch) rawConds.push(Prisma.sql`gl."importBatch" = ${importBatch}`)

  if (citiesParam.length > 0) {
    const cList = citiesParam.map(c => Prisma.sql`${c}`)
    rawConds.push(Prisma.sql`gl."postalAreaDescription" = ANY(ARRAY[${Prisma.join(cList)}])`)
  }

  if (regionParam && REGION_ZIP_PREFIXES[regionParam]) {
    const orParts = REGION_ZIP_PREFIXES[regionParam].map(p => Prisma.sql`gl."postalZipCode" LIKE ${p + '%'}`)
    rawConds.push(Prisma.sql`(${Prisma.join(orParts, ' OR ')})`)
  }

  if (nomosParam && NOMOS_ZIP_PREFIXES[nomosParam]) {
    const orParts = NOMOS_ZIP_PREFIXES[nomosParam].map(p => Prisma.sql`gl."postalZipCode" LIKE ${p + '%'}`)
    rawConds.push(Prisma.sql`(${Prisma.join(orParts, ' OR ')})`)
  }

  if (categoryParam) {
    const kadPrefixes = CATEGORY_KAD_PREFIXES[categoryParam]
    if (kadPrefixes) {
      const orParts: Prisma.Sql[] = [
        Prisma.sql`gl.category = ${categoryParam}`,
        ...kadPrefixes.map(p => Prisma.sql`EXISTS (
          SELECT 1 FROM jsonb_array_elements(gl.activities::jsonb) AS elem2
          WHERE elem2->>'firmActCode' LIKE ${p + '%'} LIMIT 1
        )`),
      ]
      rawConds.push(Prisma.sql`(${Prisma.join(orParts, ' OR ')})`)
    } else {
      rawConds.push(Prisma.sql`gl.category = ${categoryParam}`)
    }
  }

  if (hasCampaignParam === 'yes') {
    rawConds.push(Prisma.sql`EXISTS (SELECT 1 FROM "GemiCampaignRecipient" r WHERE r."gemiId" = gl.id)`)
  } else if (hasCampaignParam === 'no') {
    rawConds.push(Prisma.sql`NOT EXISTS (SELECT 1 FROM "GemiCampaignRecipient" r WHERE r."gemiId" = gl.id)`)
  }

  if (activeParam === 'yes') rawConds.push(Prisma.sql`gl."stopDate" IS NULL`)
  else if (activeParam === 'no') rawConds.push(Prisma.sql`gl."stopDate" IS NOT NULL`)

  if (emailEngagementParam === 'opened') {
    rawConds.push(Prisma.sql`EXISTS (SELECT 1 FROM "GemiCampaignRecipient" r WHERE r."gemiId" = gl.id AND r.channel = 'EMAIL' AND r."openedAt" IS NOT NULL)`)
  } else if (emailEngagementParam === 'not_opened') {
    rawConds.push(Prisma.sql`EXISTS (SELECT 1 FROM "GemiCampaignRecipient" r WHERE r."gemiId" = gl.id AND r.channel = 'EMAIL' AND r.status = 'sent' AND r."openedAt" IS NULL AND r."clickedAt" IS NULL AND r."bouncedAt" IS NULL)`)
  } else if (emailEngagementParam === 'clicked') {
    rawConds.push(Prisma.sql`EXISTS (SELECT 1 FROM "GemiCampaignRecipient" r WHERE r."gemiId" = gl.id AND r.channel = 'EMAIL' AND r."clickedAt" IS NOT NULL)`)
  } else if (emailEngagementParam === 'bounced') {
    rawConds.push(Prisma.sql`EXISTS (SELECT 1 FROM "GemiCampaignRecipient" r WHERE r."gemiId" = gl.id AND r.channel = 'EMAIL' AND r."bouncedAt" IS NOT NULL)`)
  } else if (emailEngagementParam === 'unsubscribed') {
    rawConds.push(Prisma.sql`EXISTS (SELECT 1 FROM "GemiCampaignRecipient" r WHERE r."gemiId" = gl.id AND r.channel = 'EMAIL' AND r."unsubscribedAt" IS NOT NULL)`)
  }

  const whereClause = rawConds.length > 0
    ? Prisma.sql`WHERE ${Prisma.join(rawConds, ' AND ')}`
    : Prisma.sql``

  const skip = (page - 1) * limit

  // Count and paginated IDs via raw SQL (no IN-array bind-variable overflow)
  const [countRows, pageIdRows] = await Promise.all([
    prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) AS count FROM "GemiLookup" gl ${whereClause}`,
    prisma.$queryRaw<{ id: string }[]>`SELECT gl.id FROM "GemiLookup" gl ${whereClause} ORDER BY gl."createdAt" DESC LIMIT ${limit} OFFSET ${skip}`,
  ])

  const total = Number(countRows[0]?.count ?? 0)
  const pageIds = pageIdRows.map(r => r.id)

  // Fetch full records for this page (at most `limit` IDs — well under 32767)
  const [businesses] = await Promise.all([
    pageIds.length > 0
      ? prisma.gemiLookup.findMany({
          where: { id: { in: pageIds } },
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
        })
      : Promise.resolve([]),
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
