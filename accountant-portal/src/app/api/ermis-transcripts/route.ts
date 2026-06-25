import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

// Lists Ερμής conversations (BusinessMatchToken rows that have a chatLog) so
// admins can browse every transcript in one place instead of opening them
// one match at a time from /matches. Admin-only.
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN' && session.user.role !== 'CONSULTANT') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = request.nextUrl
  const page = parseInt(searchParams.get('page') || '1')
  const search = searchParams.get('search') || ''
  const caseAssignedFilter = searchParams.get('caseAssigned') || ''
  const skip = (page - 1) * PAGE_SIZE

  const where: any = { chatLog: { not: Prisma.DbNull } }

  const businessFilter: any = {}
  if (search) {
    businessFilter.OR = [
      { onomasia: { contains: search, mode: 'insensitive' } },
      { afm: { contains: search, mode: 'insensitive' } },
    ]
  }
  if (Object.keys(businessFilter).length > 0) {
    const matchingBusinesses = await prisma.business.findMany({ where: businessFilter, select: { id: true } })
    where.businessId = { in: matchingBusinesses.map(b => b.id) }
  }

  if (caseAssignedFilter === 'yes') where.caseCreatedId = { not: null }
  if (caseAssignedFilter === 'no') where.caseCreatedId = null

  const [tokens, total] = await Promise.all([
    prisma.businessMatchToken.findMany({
      where,
      select: {
        id: true,
        businessId: true,
        programId: true,
        createdAt: true,
        tokenUsage: true,
        tokenUsageInput: true,
        tokenUsageOutput: true,
        caseCreatedId: true,
        chatLog: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: PAGE_SIZE,
    }),
    prisma.businessMatchToken.count({ where }),
  ])

  const [businesses, programs] = await Promise.all([
    prisma.business.findMany({
      where: { id: { in: tokens.map(t => t.businessId) } },
      select: { id: true, onomasia: true, afm: true, accountant: { select: { officeName: true } } },
    }),
    prisma.program.findMany({
      where: { id: { in: tokens.map(t => t.programId) } },
      select: { id: true, title: true },
    }),
  ])
  const businessMap = new Map(businesses.map(b => [b.id, b]))
  const programMap = new Map(programs.map(p => [p.id, p]))

  const transcripts = tokens.map(t => {
    const log = Array.isArray(t.chatLog) ? (t.chatLog as any[]) : []
    return {
      businessId: t.businessId,
      programId: t.programId,
      business: businessMap.get(t.businessId) || null,
      program: programMap.get(t.programId) || null,
      createdAt: t.createdAt,
      tokenUsage: t.tokenUsage,
      tokenUsageInput: t.tokenUsageInput,
      tokenUsageOutput: t.tokenUsageOutput,
      caseAssigned: Boolean(t.caseCreatedId),
      messageCount: log.length,
      lastMessage: log.length > 0 ? log[log.length - 1].text : null,
    }
  })

  return NextResponse.json({ transcripts, total })
}
