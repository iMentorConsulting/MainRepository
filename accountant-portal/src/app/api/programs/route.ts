import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { runMatchingForProgram } from '@/lib/matching'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isAccountant = session.user.role === 'ACCOUNTANT'
  const accountantId = (session.user as any).accountantId as string | null

  const programs = await prisma.program.findMany({
    include: {
      _count: {
        select: {
          // For ACCOUNTANTs, Prisma doesn't natively support filtered _count in findMany.
          // We include full count here and patch it below for accountants.
          matches: { where: { status: { not: 'REJECTED' } } },
          campaigns: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Patch match counts so ACCOUNTANTs only see matches for their own businesses
  if (isAccountant && accountantId) {
    const myCounts = await prisma.programMatch.groupBy({
      by: ['programId'],
      where: { business: { accountantId }, status: { not: 'REJECTED' } },
      _count: { _all: true },
    })
    const countMap = new Map(myCounts.map(r => [r.programId, r._count._all]))
    for (const p of programs) {
      (p._count as any).matches = countMap.get(p.id) ?? 0
    }
  }

  return NextResponse.json({ programs })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const data = await request.json()

  // Convert date strings to Date objects
  if (data.startDate) data.startDate = new Date(data.startDate)
  else delete data.startDate
  if (data.endDate) data.endDate = new Date(data.endDate)
  else delete data.endDate

  const program = await prisma.program.create({ data })

  // Always compute matches on create, even for inactive/draft programs — an
  // admin previewing matches before flipping the program active otherwise
  // sees a misleading "0 matched" with no indication why. Computing matches
  // doesn't notify anyone; that's a separate, explicit step (notify route).
  runMatchingForProgram(program.id).catch(err => console.error('[Matching] Auto-match for new program failed:', err?.message))

  return NextResponse.json(program, { status: 201 })
}
