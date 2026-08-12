import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { lookupAfm, GSIS_TERMINAL_ERRORS } from '@/lib/gsis'
import { getEffectiveCategory } from '@/lib/business-categories'

// Same logic as applySoleProprietorFix in businesses/import/route.ts:
// AADE returns no legalStatusDescr for natural persons — detect by empty status + 3-word name.
function applySoleProprietorFix(onomasia: string, legalStatusDescr: string | null | undefined): { onomasia: string; legalStatusDescr: string | null | undefined } {
  if (!legalStatusDescr) {
    const parts = onomasia.trim().split(/\s+/).filter(Boolean)
    if (parts.length >= 3) {
      return { onomasia: parts.slice(0, 2).join(' '), legalStatusDescr: 'ΑΤΟΜΙΚΗ' }
    }
    return { onomasia, legalStatusDescr: 'ΑΤΟΜΙΚΗ' }
  }
  return { onomasia, legalStatusDescr }
}

export async function POST(request: NextRequest) {
  // Auth: ADMIN session OR Bearer CRON_SECRET
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`
  if (!isCron) {
    const session = await auth()
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  let body: { limit?: number; forceRetry?: boolean } = {}
  try {
    body = await request.json()
  } catch {
    // body is optional
  }

  const limit = Math.min(body.limit ?? 100, 500)
  const forceRetry = !!body.forceRetry

  const retryThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000)

  // Terminal errors (GSIS confirmed "not found", "inactive", etc.) are never retried.
  // NOTE: NOT { aadeError: { in: [...] } } silently drops NULL rows in SQL, so we
  // express the condition as an explicit OR to correctly include pending (null) records.
  const terminalErrors = Array.from(GSIS_TERMINAL_ERRORS)
  const records = await prisma.gemiLookup.findMany({
    where: {
      aadeEnriched: false,
      OR: [
        { aadeError: null },
        {
          aadeError: { notIn: terminalErrors },
          ...(forceRetry ? {} : { updatedAt: { lt: retryThreshold } }),
        },
      ],
    },
    take: limit,
    orderBy: { updatedAt: 'asc' },
  })

  let processed = 0
  let enriched = 0
  let errors = 0
  let monthlyLimitExceeded = false

  const QUOTA_ERRORS = new Set([
    'RG_WS_PUBLIC_MONTHLY_LIMIT_EXCEEDED',
    'RG_WS_PUBLIC_DAILY_LIMIT_EXCEEDED',
    'RG_WS_PUBLIC_LIMIT_EXCEEDED',
  ])

  for (const record of records) {
    processed++

    try {
      const data = await lookupAfm(record.afm)

      if (!data) {
        // GSIS returned OK but no onomasia — store descriptive error
        console.log(`[Enrich] AFM ${record.afm}: no onomasia returned, marking as no-data`)
        await prisma.gemiLookup.update({
          where: { id: record.id },
          data: { aadeError: 'GSIS_NO_ONOMASIA' },
        })
        errors++
      } else {
        console.log(`[Enrich] AFM ${record.afm}: enriched OK (${data.onomasia})`)
        await prisma.gemiLookup.update({
          where: { id: record.id },
          data: {
            ...applySoleProprietorFix(data.onomasia, data.legalStatusDescr),
            postalAddress: data.postalAddress,
            postalAddressNo: data.postalAddressNo,
            postalZipCode: data.postalZipCode,
            postalAreaDescription: data.postalAreaDescription,
            doy: data.doy,
            doyDescr: data.doyDescr,
            regdate: data.regdate,
            deactivationFlag: data.deactivationFlag,
            stopDate: data.stopDate,
            activities: data.activities.map(a => ({
              firmActCode: a.firmActCode,
              firmActDescr: a.firmActDescr,
              firmActKind: a.firmActKind,
              firmActKindDescr: a.firmActKindDescr,
            })),
            category: getEffectiveCategory({ tags: record.tags, activities: data.activities }) ?? null,
            aadeEnriched: true,
            aadeEnrichedAt: new Date(),
            aadeError: null,
          },
        })
        enriched++
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      if (QUOTA_ERRORS.has(message)) {
        // Don't mark the record as errored — quota resets, will be picked up next time.
        monthlyLimitExceeded = true
        processed--
        console.log(`[Enrich] Quota limit hit (${message}), stopping batch after ${processed} records`)
        break
      }
      // Store the specific GSIS error code (e.g. RG_WS_PUBLIC_AFM_SUBJECT_IS_NOT_ACTIVE)
      // so we know exactly why it failed and whether to retry.
      console.log(`[Enrich] AFM ${record.afm}: error — ${message}`)
      await prisma.gemiLookup.update({
        where: { id: record.id },
        data: { aadeError: message },
      })
      errors++
    }

    if (processed < records.length) {
      await new Promise(resolve => setTimeout(resolve, 200))
    }
  }

  // How many still await enrichment (for client-side progress/looping)
  const remaining = await prisma.gemiLookup.count({
    where: {
      aadeEnriched: false,
      OR: [
        { aadeError: null },
        {
          aadeError: { notIn: Array.from(GSIS_TERMINAL_ERRORS) },
          updatedAt: { lt: retryThreshold },
        },
      ],
    },
  })

  const terminalCount = await prisma.gemiLookup.count({
    where: { aadeEnriched: false, aadeError: { in: Array.from(GSIS_TERMINAL_ERRORS) } },
  })

  return NextResponse.json({ processed, enriched, errors, remaining, monthlyLimitExceeded, terminalCount })
}
