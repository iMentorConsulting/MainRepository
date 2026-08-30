import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function escCsv(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
  return s
}

function allKads(activities: unknown): { codes: string; descrs: string; kinds: string } {
  if (!Array.isArray(activities) || activities.length === 0) return { codes: '', descrs: '', kinds: '' }
  const acts = activities as any[]
  return {
    codes: acts.map(a => a.firmActCode ?? '').join('|'),
    descrs: acts.map(a => a.firmActDescr ?? '').join('|'),
    kinds: acts.map(a => a.firmActKind ?? '').join('|'),
  }
}

const HEADER = [
  'id', 'afm', 'onomasia', 'email', 'phone', 'mobilePhone',
  'postalAddress', 'postalZipCode', 'postalAreaDescription',
  'legalStatus', 'regdate', 'stopDate',
  'kadCodes', 'kadDescriptions', 'kadKinds',
  'category', 'importBatch', 'tags',
  'aadeEnriched', 'matchingDone',
  'unsubscribedAt', 'createdAt',
].join(',') + '\n'

export async function GET(_req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const date = new Date().toISOString().slice(0, 10)
  const encoder = new TextEncoder()
  const BATCH = 2000

  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(HEADER))

        let cursor: string | undefined
        while (true) {
          const batch = await prisma.gemiLookup.findMany({
            take: BATCH,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
            orderBy: { id: 'asc' },
            select: {
              id: true, afm: true, onomasia: true, email: true, phone: true, mobilePhone: true,
              postalAddress: true, postalZipCode: true, postalAreaDescription: true,
              legalStatusDescr: true, regdate: true, stopDate: true,
              activities: true, category: true, importBatch: true, tags: true,
              aadeEnriched: true, matchingDone: true,
              unsubscribedAt: true, createdAt: true,
            },
          })

          if (batch.length > 0) {
            const chunk = batch.map(r => {
              const { codes, descrs, kinds } = allKads(r.activities)
              return [
                r.id, r.afm, r.onomasia, r.email, r.phone, r.mobilePhone,
                r.postalAddress, r.postalZipCode, r.postalAreaDescription,
                r.legalStatusDescr, r.regdate, r.stopDate,
                codes, descrs, kinds,
                r.category, r.importBatch, (r.tags ?? []).join('|'),
                r.aadeEnriched, r.matchingDone,
                r.unsubscribedAt?.toISOString() ?? '', r.createdAt.toISOString(),
              ].map(escCsv).join(',')
            }).join('\n') + '\n'

            controller.enqueue(encoder.encode(chunk))
            cursor = batch[batch.length - 1].id
          }

          if (batch.length < BATCH) break
        }

        controller.close()
      } catch (err) {
        controller.error(err)
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="gemi-businesses-${date}.csv"`,
    },
  })
}
