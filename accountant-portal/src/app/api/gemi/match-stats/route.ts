import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveRegionFromZip } from '@/lib/greek-regions'
import { normalizeLegalForm } from '@/lib/legal-forms'
import { resolveRegdate } from '@/lib/matching'

function normalizeKad(code: string): string {
  return /^\d{7}$/.test(code) ? '0' + code : code
}

// GET /api/gemi/match-stats?programId=xxx
// Dry-runs the matching logic against all GEMI businesses and returns
// aggregated counts per failure reason — without writing anything to the DB.
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const programId = request.nextUrl.searchParams.get('programId')
  if (!programId) return NextResponse.json({ error: 'programId required' }, { status: 400 })

  const program = await prisma.program.findUnique({ where: { id: programId } })
  if (!program) return NextResponse.json({ error: 'Program not found' }, { status: 404 })

  const businesses = await prisma.gemiLookup.findMany({
    where: { aadeEnriched: true },
    select: {
      id: true,
      afm: true,
      postalZipCode: true,
      postalAreaDescription: true,
      legalStatusDescr: true,
      regdate: true,
      tags: true,
      activities: true,
    },
  })

  const total = businesses.length
  let matched = 0
  const failures: Record<string, number> = {
    excludeTag: 0,
    requireTag: 0,
    legalForm: 0,
    kad: 0,
    region: 0,
    zip: 0,
    date: 0,
  }

  // Sample of businesses failing the region check (to inspect their zip codes)
  const regionFailSample: { afm: string; postalZipCode: string | null; postalAreaDescription: string | null }[] = []
  // Distribution of zip prefixes for region-failing businesses
  const zipPrefixDist: Record<string, number> = {}

  for (const b of businesses) {
    const rawActivities = Array.isArray(b.activities)
      ? b.activities
      : (typeof b.activities === 'string' ? JSON.parse(b.activities as string) : [])
    const activities = (rawActivities as { firmActCode: string }[]).map(a => ({ firmActCode: a.firmActCode }))
    const tags = b.tags

    // Exclusion checks (hard stops)
    if ((program as any).excludeTags?.length > 0 && tags.some((t: string) => (program as any).excludeTags.includes(t))) {
      failures.excludeTag++; continue
    }
    if ((program as any).requireTags?.length > 0 && !(program as any).requireTags.some((t: string) => tags.includes(t))) {
      failures.requireTag++; continue
    }
    if ((program as any).excludedLegalForms?.length > 0) {
      const lf = normalizeLegalForm(b.legalStatusDescr)
      if ((program as any).excludedLegalForms.includes(lf)) {
        failures.legalForm++; continue
      }
    }

    let failedCriterion: string | null = null

    if ((program as any).kadRules?.length > 0) {
      const ok = activities.some(a => {
        const code = normalizeKad(a.firmActCode)
        const matches = (program as any).kadRules.some((r: string) => {
          const clean = normalizeKad(r.trim())
          return clean.includes('.') ? code === clean : code.startsWith(clean)
        })
        if (!matches) return false
        const excluded = ((program as any).excludedKadRules || []).some((r: string) => {
          const clean = normalizeKad(r.trim())
          return clean.includes('.') ? code === clean : code.startsWith(clean)
        })
        return !excluded
      })
      if (!ok) failedCriterion = 'kad'
    }

    if (!failedCriterion && (program as any).regionRules?.length > 0) {
      const region = resolveRegionFromZip(b.postalZipCode)
      const ok = !!region && (program as any).regionRules.includes(region)
      if (!ok) {
        failedCriterion = 'region'
        if (regionFailSample.length < 20) {
          regionFailSample.push({ afm: b.afm, postalZipCode: b.postalZipCode, postalAreaDescription: b.postalAreaDescription })
        }
        const prefix = b.postalZipCode?.trim().slice(0, 2) || 'null'
        zipPrefixDist[prefix] = (zipPrefixDist[prefix] || 0) + 1
      }
    }

    if (!failedCriterion && (program as any).zipCodeRules?.length > 0) {
      const zip = b.postalZipCode || ''
      const ok = (program as any).zipCodeRules.some((r: string) => zip.startsWith(r) || zip === r)
      if (!ok) failedCriterion = 'zip'
    }

    if (!failedCriterion && ((program as any).minRegdate || (program as any).maxRegdate)) {
      const regdate = b.regdate ? new Date(b.regdate) : null
      const resolvedMin = resolveRegdate((program as any).minRegdate)
      const resolvedMax = resolveRegdate((program as any).maxRegdate)
      let ok = !!regdate
      if (ok && resolvedMin && regdate! < resolvedMin) ok = false
      if (ok && resolvedMax && regdate! > resolvedMax) ok = false
      if (!ok) failedCriterion = 'date'
    }

    if (failedCriterion) {
      failures[failedCriterion]++
    } else {
      matched++
    }
  }

  // South Aegean specific breakdown: businesses with 84/85 zip prefix
  const saTotal = businesses.filter(b => {
    const pfx = b.postalZipCode?.trim().slice(0, 2) || ''
    return pfx === '84' || pfx === '85'
  }).length

  // KAD code distribution for South Aegean businesses that fail KAD
  const saKadFailDist: Record<string, number> = {}
  for (const b of businesses) {
    const pfx = b.postalZipCode?.trim().slice(0, 2) || ''
    if (pfx !== '84' && pfx !== '85') continue
    const rawActivities = Array.isArray(b.activities)
      ? b.activities
      : (typeof b.activities === 'string' ? JSON.parse(b.activities as string) : [])
    const activities = (rawActivities as { firmActCode: string }[]).map(a => ({ firmActCode: a.firmActCode }))
    if ((program as any).kadRules?.length > 0) {
      const ok = activities.some(a => {
        const code = normalizeKad(a.firmActCode)
        const matches = (program as any).kadRules.some((r: string) => {
          const clean = normalizeKad(r.trim())
          return clean.includes('.') ? code === clean : code.startsWith(clean)
        })
        if (!matches) return false
        const excluded = ((program as any).excludedKadRules || []).some((r: string) => {
          const clean = normalizeKad(r.trim())
          return clean.includes('.') ? code === clean : code.startsWith(clean)
        })
        return !excluded
      })
      if (!ok) {
        // Count their primary KAD code
        const primaryKad = activities[0]?.firmActCode || 'none'
        const prefix4 = primaryKad.slice(0, 4)
        saKadFailDist[prefix4] = (saKadFailDist[prefix4] || 0) + 1
      }
    }
  }

  return NextResponse.json({
    program: { id: program.id, title: (program as any).title, kadRules: (program as any).kadRules, regionRules: (program as any).regionRules },
    total,
    matched,
    failures,
    regionFailSample,
    zipPrefixDistribution: Object.entries(zipPrefixDist).sort((a, b) => b[1] - a[1]).slice(0, 20),
    southAegean: {
      total: saTotal,
      passing: matched + failures.date,
      failingKAD: Object.values(saKadFailDist).reduce((s, v) => s + v, 0),
      topKADsOfFailingBusinesses: Object.entries(saKadFailDist).sort((a, b) => b[1] - a[1]).slice(0, 30),
    },
  })
}
