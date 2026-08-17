import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

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
  const sourceFilter = searchParams.get('source') || '' // 'business' | 'gemi' | ''
  const skip = (page - 1) * PAGE_SIZE

  // ── Business match tokens ────────────────────────────────────────────────
  const bizWhere: any = { chatLog: { not: Prisma.DbNull } }
  if (search) {
    const matchingBusinesses = await prisma.business.findMany({
      where: { OR: [{ onomasia: { contains: search, mode: 'insensitive' } }, { afm: { contains: search, mode: 'insensitive' } }] },
      select: { id: true },
    })
    bizWhere.businessId = { in: matchingBusinesses.map(b => b.id) }
  }
  if (caseAssignedFilter === 'yes') bizWhere.caseCreatedId = { not: null }
  if (caseAssignedFilter === 'no') bizWhere.caseCreatedId = null

  // ── GEMI match tokens ────────────────────────────────────────────────────
  const gemiWhere: any = {}
  if (search) {
    const matchingGemi = await prisma.gemiLookup.findMany({
      where: { OR: [{ onomasia: { contains: search, mode: 'insensitive' } }, { afm: { contains: search, mode: 'insensitive' } }] },
      select: { id: true },
    })
    gemiWhere.gemiId = { in: matchingGemi.map(g => g.id) }
  }
  if (caseAssignedFilter === 'yes') gemiWhere.caseCreatedAt = { not: null }
  if (caseAssignedFilter === 'no') gemiWhere.caseCreatedAt = null

  const includeBiz = sourceFilter !== 'gemi'
  const includeGemi = sourceFilter !== 'business'

  const [bizTokens, bizTotal, gemiTokens, gemiTotal] = await Promise.all([
    includeBiz
      ? prisma.businessMatchToken.findMany({
          where: bizWhere,
          select: {
            businessId: true, programId: true, createdAt: true,
            tokenUsage: true, tokenUsageInput: true, tokenUsageOutput: true,
            caseCreatedId: true, chatLog: true, eligibilityStatus: true, intentStatus: true,
          },
          orderBy: { createdAt: 'desc' },
        })
      : Promise.resolve([]),
    includeBiz ? prisma.businessMatchToken.count({ where: bizWhere }) : Promise.resolve(0),
    includeGemi
      ? prisma.gemiMatchToken.findMany({
          where: gemiWhere,
          select: {
            gemiId: true, programId: true, createdAt: true,
            tokenUsage: true, chatLog: true, caseCreatedAt: true,
            eligibilityStatus: true, intentStatus: true,
            gemi: { select: { id: true, onomasia: true, afm: true, claimedBusinessId: true } },
          },
          orderBy: { createdAt: 'desc' },
        })
      : Promise.resolve([]),
    includeGemi ? prisma.gemiMatchToken.count({ where: gemiWhere }) : Promise.resolve(0),
  ])

  // Enrich business tokens
  const [businesses, programs] = await Promise.all([
    bizTokens.length
      ? prisma.business.findMany({
          where: { id: { in: bizTokens.map(t => t.businessId) } },
          select: { id: true, onomasia: true, afm: true, accountant: { select: { officeName: true } } },
        })
      : Promise.resolve([]),
    prisma.program.findMany({
      where: { id: { in: [...bizTokens.map(t => t.programId), ...gemiTokens.map(t => t.programId)] } },
      select: { id: true, title: true },
    }),
  ])
  const businessMap = new Map(businesses.map(b => [b.id, b]))
  const programMap = new Map(programs.map(p => [p.id, p]))

  type TranscriptRow = {
    source: 'business' | 'gemi'
    businessId: string | null
    gemiId: string | null
    programId: string
    onomasia: string | null
    afm: string | null
    accountantOffice: string | null
    program: { id: string; title: string } | null
    createdAt: Date
    tokenUsage: number
    tokenUsageInput: number
    tokenUsageOutput: number
    caseAssigned: boolean
    messageCount: number
    lastMessage: string | null
    eligibilityStatus: string | null
    intentStatus: string | null
  }

  const bizRows: TranscriptRow[] = bizTokens.map(t => {
    const biz = businessMap.get(t.businessId)
    const log = Array.isArray(t.chatLog) ? (t.chatLog as any[]) : []
    return {
      source: 'business',
      businessId: t.businessId,
      gemiId: null,
      programId: t.programId,
      onomasia: biz?.onomasia ?? null,
      afm: biz?.afm ?? null,
      accountantOffice: biz?.accountant?.officeName ?? null,
      program: programMap.get(t.programId) ?? null,
      createdAt: t.createdAt,
      tokenUsage: t.tokenUsage,
      tokenUsageInput: t.tokenUsageInput ?? 0,
      tokenUsageOutput: t.tokenUsageOutput ?? 0,
      caseAssigned: Boolean(t.caseCreatedId),
      messageCount: log.length,
      lastMessage: log.length > 0 ? log[log.length - 1].text : null,
      eligibilityStatus: t.eligibilityStatus ?? null,
      intentStatus: t.intentStatus ?? null,
    }
  })

  const gemiRows: TranscriptRow[] = gemiTokens
    .filter(t => { const log = Array.isArray(t.chatLog) ? t.chatLog as any[] : []; return log.length > 0 })
    .map(t => {
      const log = Array.isArray(t.chatLog) ? (t.chatLog as any[]) : []
      return {
        source: 'gemi',
        businessId: t.gemi?.claimedBusinessId ?? null,
        gemiId: t.gemiId,
        programId: t.programId,
        onomasia: t.gemi?.onomasia ?? null,
        afm: t.gemi?.afm ?? null,
        accountantOffice: null,
        program: programMap.get(t.programId) ?? null,
        createdAt: t.createdAt,
        tokenUsage: t.tokenUsage,
        tokenUsageInput: 0,
        tokenUsageOutput: 0,
        caseAssigned: Boolean(t.caseCreatedAt),
        messageCount: log.length,
        lastMessage: log.length > 0 ? log[log.length - 1].text : null,
        eligibilityStatus: t.eligibilityStatus ?? null,
        intentStatus: t.intentStatus ?? null,
      }
    })

  // Merge and sort by date desc, then paginate
  const all = [...bizRows, ...gemiRows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  const total = bizTotal + gemiTotal
  const transcripts = all.slice(skip, skip + PAGE_SIZE)

  return NextResponse.json({ transcripts, total })
}
