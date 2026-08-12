import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveRegionFromZip } from '@/lib/greek-regions'
import { normalizeLegalForm } from '@/lib/legal-forms'
import { resolveRegdate, formatRegdateDisplay } from '@/lib/matching'

interface DiagnosisResult {
  pass: boolean
  criterion: string
  detail: string
}

function normalizeKad(code: string): string {
  return /^\d{7}$/.test(code) ? '0' + code : code
}

function diagnoseGemiMatch(
  business: {
    afm: string
    onomasia: string | null
    legalStatusDescr: string | null
    postalZipCode: string | null
    regdate: string | null
    tags: string[]
    activities: { firmActCode: string; firmActDescr: string | null }[]
  },
  program: {
    kadRules: string[]
    excludedKadRules: string[]
    regionRules: string[]
    zipCodeRules: string[]
    minRegdate: string | null
    maxRegdate: string | null
    excludedLegalForms: string[]
    excludeTags: string[]
    requireTags: string[]
  }
): DiagnosisResult[] {
  const out: DiagnosisResult[] = []
  const legalForm = normalizeLegalForm(business.legalStatusDescr)

  if (program.excludeTags.length > 0) {
    const hit = business.tags.find(t => program.excludeTags.includes(t))
    out.push({ pass: !hit, criterion: 'excludeTags', detail: hit ? `Η επιχείρηση έχει το tag "${hit}" που είναι στη λίστα εξαίρεσης` : 'Καμία επικάλυψη με tags εξαίρεσης' })
  }
  if (program.requireTags.length > 0) {
    const hasAny = program.requireTags.some(t => business.tags.includes(t))
    out.push({ pass: hasAny, criterion: 'requireTags', detail: hasAny ? 'Η επιχείρηση έχει ένα από τα απαιτούμενα tags' : `Η επιχείρηση δεν έχει κανένα από τα απαιτούμενα tags: ${program.requireTags.join(', ')}` })
  }
  if (program.excludedLegalForms.length > 0) {
    const excluded = program.excludedLegalForms.includes(legalForm)
    out.push({ pass: !excluded, criterion: 'excludedLegalForms', detail: excluded ? `Η νομική μορφή "${legalForm}" είναι στη λίστα εξαιρούμενων μορφών` : `Η νομική μορφή "${legalForm}" δεν είναι εξαιρούμενη` })
  }

  if (program.kadRules.length > 0) {
    const matchedKad = business.activities.find(activity => {
      const activityCode = normalizeKad(activity.firmActCode)
      const matchesRule = program.kadRules.some(rule => {
        const cleanRule = normalizeKad(rule.trim())
        return cleanRule.includes('.') ? activityCode === cleanRule : activityCode.startsWith(cleanRule)
      })
      if (!matchesRule) return false
      const isExcluded = program.excludedKadRules.some(rule => {
        const cleanRule = normalizeKad(rule.trim())
        return cleanRule.includes('.') ? activityCode === cleanRule : activityCode.startsWith(cleanRule)
      })
      return !isExcluded
    })
    const excludedNote = program.excludedKadRules.length > 0 ? ` (εξαιρούνται: ${program.excludedKadRules.join(', ')})` : ''
    out.push({
      pass: !!matchedKad,
      criterion: 'kadRules',
      detail: matchedKad
        ? `Ταιριάζει ΚΑΔ ${matchedKad.firmActCode}${matchedKad.firmActDescr ? ` — ${matchedKad.firmActDescr}` : ''}`
        : `Κανένα ΚΑΔ (${business.activities.map(a => a.firmActCode).join(', ') || '—'}) δεν ταιριάζει${excludedNote}`,
    })
  }

  if (program.regionRules.length > 0) {
    const businessRegion = resolveRegionFromZip(business.postalZipCode)
    const matched = !!businessRegion && program.regionRules.includes(businessRegion)
    out.push({
      pass: matched,
      criterion: 'regionRules',
      detail: matched
        ? `Περιφέρεια: ${businessRegion}`
        : `Η περιφέρεια (ΤΚ ${business.postalZipCode || '—'} → ${businessRegion || 'άγνωστη'}) δεν είναι στις επιλεγμένες`,
    })
  }

  if (program.zipCodeRules.length > 0) {
    const zip = business.postalZipCode || ''
    const matched = program.zipCodeRules.some(r => zip.startsWith(r) || zip === r)
    out.push({
      pass: matched,
      criterion: 'zipCodeRules',
      detail: matched ? `ΤΚ ${zip} ταιριάζει` : `ΤΚ ${zip || '—'} δεν ταιριάζει με κανέναν κανόνα ΤΚ`,
    })
  }

  if (program.minRegdate || program.maxRegdate) {
    const regdate = business.regdate ? new Date(business.regdate) : null
    const resolvedMin = resolveRegdate(program.minRegdate)
    const resolvedMax = resolveRegdate(program.maxRegdate)
    let ok = !!regdate
    if (resolvedMin && regdate && regdate < resolvedMin) ok = false
    if (resolvedMax && regdate && regdate > resolvedMax) ok = false
    out.push({
      pass: ok,
      criterion: 'regdate',
      detail: regdate
        ? `Ημ. ίδρυσης ${regdate.toLocaleDateString('el-GR')} έναντι εύρους ${formatRegdateDisplay(program.minRegdate)} έως ${formatRegdateDisplay(program.maxRegdate)}`
        : 'Άγνωστη ημερομηνία ίδρυσης',
    })
  }

  return out
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const afm = request.nextUrl.searchParams.get('afm')?.trim()
  const programId = request.nextUrl.searchParams.get('programId')?.trim()
  if (!afm) return NextResponse.json({ error: 'Απαιτείται ΑΦΜ' }, { status: 400 })
  if (!programId) return NextResponse.json({ error: 'Απαιτείται programId' }, { status: 400 })

  const normalizedAfm = afm.replace(/\D/g, '').padStart(9, '0')

  const [program, gemi] = await Promise.all([
    prisma.program.findUnique({ where: { id: programId } }),
    prisma.gemiLookup.findFirst({ where: { afm: normalizedAfm } }),
  ])

  if (!program) return NextResponse.json({ error: 'Δεν βρέθηκε πρόγραμμα' }, { status: 404 })
  if (!gemi) return NextResponse.json({ error: 'Δεν βρέθηκε επιχείρηση ΓΕΜΗ με αυτό το ΑΦΜ' }, { status: 404 })

  const rawActivities = Array.isArray(gemi.activities)
    ? gemi.activities
    : (typeof gemi.activities === 'string' ? JSON.parse(gemi.activities as string) : [])

  const activities = (rawActivities as { firmActCode: string; firmActDescr?: string | null }[]).map(a => ({
    firmActCode: a.firmActCode,
    firmActDescr: a.firmActDescr ?? null,
  }))

  const business = {
    afm: gemi.afm,
    onomasia: gemi.onomasia,
    legalStatusDescr: gemi.legalStatusDescr,
    postalZipCode: gemi.postalZipCode,
    regdate: gemi.regdate,
    tags: gemi.tags,
    activities,
  }

  const results = diagnoseGemiMatch(business, program as any)
  const overall = results.length === 0 || results.every(r => r.pass)

  return NextResponse.json({
    business: {
      afm: gemi.afm,
      onomasia: gemi.onomasia,
      legalStatusDescr: gemi.legalStatusDescr,
      postalZipCode: gemi.postalZipCode,
      regdate: gemi.regdate,
      aadeEnriched: gemi.aadeEnriched,
      matchingDone: gemi.matchingDone,
    },
    overall,
    results,
  })
}
