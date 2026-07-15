import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)

  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10) || 50))
  const search = searchParams.get('search')?.trim() ?? ''
  const aadeEnrichedParam = searchParams.get('aadeEnriched')
  const matchingDoneParam = searchParams.get('matchingDone')
  const claimedParam = searchParams.get('claimed')
  const importBatch = searchParams.get('importBatch')?.trim() ?? ''

  const where: Record<string, unknown> = {}

  if (search) {
    where.OR = [
      { afm: { contains: search, mode: 'insensitive' } },
      { onomasia: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
    ]
  }

  if (aadeEnrichedParam === 'true') {
    where.aadeEnriched = true
  } else if (aadeEnrichedParam === 'false') {
    where.aadeEnriched = false
  }

  if (matchingDoneParam === 'true') {
    where.matchingDone = true
  } else if (matchingDoneParam === 'false') {
    where.matchingDone = false
  }

  if (claimedParam === 'true') {
    where.claimedBusinessId = { not: null }
  } else if (claimedParam === 'false') {
    where.claimedBusinessId = null
  }

  if (importBatch) {
    where.importBatch = importBatch
  }

  const skip = (page - 1) * limit

  const [businesses, total] = await Promise.all([
    prisma.gemiLookup.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { programMatches: true },
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
