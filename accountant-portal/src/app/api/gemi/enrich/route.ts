import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { lookupAfm } from '@/lib/gsis'

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

  let body: { limit?: number } = {}
  try {
    body = await request.json()
  } catch {
    // body is optional
  }

  const limit = Math.min(body.limit ?? 100, 500)

  const retryThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const records = await prisma.gemiLookup.findMany({
    where: {
      aadeEnriched: false,
      OR: [
        { aadeError: null },
        { aadeError: { not: null }, updatedAt: { lt: retryThreshold } },
      ],
    },
    take: limit,
    orderBy: { updatedAt: 'asc' },
  })

  let processed = 0
  let enriched = 0
  let errors = 0

  for (const record of records) {
    processed++

    try {
      const data = await lookupAfm(record.afm)

      if (!data) {
        await prisma.gemiLookup.update({
          where: { id: record.id },
          data: { aadeError: 'No data returned from AADE' },
        })
        errors++
      } else {
        await prisma.gemiLookup.update({
          where: { id: record.id },
          data: {
            onomasia: data.onomasia,
            legalStatusDescr: data.legalStatusDescr,
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
            aadeEnriched: true,
            aadeEnrichedAt: new Date(),
            aadeError: null,
          },
        })
        enriched++
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
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

  return NextResponse.json({ processed, enriched, errors })
}
