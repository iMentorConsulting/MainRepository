import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const PAGE_SIZE = 50

// Human-readable source labels
export const SOURCE_LABELS: Record<string, string> = {
  'accountant':       'Λογιστής (Portal)',
  'exodikastikos':    'Εξωδικαστικός',
  'ermis-lead':       'Ερμής / Case Mgmt',
  'finance-import':   'Finance Import',
  'lead-form':        'Lead Form (Ιστοσελίδα)',
  'website-form':     'Φόρμα ΑΦΜ (Ιστοσελίδα)',
  'case-management':  'Case Management',
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = request.nextUrl
  const page    = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const sources = searchParams.get('sources')?.split(',').filter(Boolean) || []
  const accountantIds = searchParams.get('accountantIds')?.split(',').filter(Boolean) || []
  const dateFrom = searchParams.get('dateFrom')
  const dateTo   = searchParams.get('dateTo')
  const search   = searchParams.get('search')?.trim() || ''

  const where: any = {}
  if (sources.length)      where.source      = { in: sources }
  if (accountantIds.length) where.accountantId = { in: accountantIds }
  if (dateFrom || dateTo) {
    where.createdAt = {}
    if (dateFrom) where.createdAt.gte = new Date(dateFrom)
    if (dateTo)   where.createdAt.lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999))
  }
  if (search) {
    where.OR = [
      { afm:      { contains: search, mode: 'insensitive' } },
      { onomasia: { contains: search, mode: 'insensitive' } },
    ]
  }

  const [businesses, total] = await Promise.all([
    prisma.business.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        afm: true,
        onomasia: true,
        source: true,
        createdAt: true,
        accountantId: true,
        accountant: { select: { officeName: true } },
      },
    }),
    prisma.business.count({ where }),
  ])

  // Cross-reference AuditLog to get the user who created each business
  // (only available for portal-created businesses where action='CREATE')
  const businessIds = businesses.map(b => b.id)
  const auditEntries = businessIds.length
    ? await prisma.auditLog.findMany({
        where: { entity: 'Business', action: 'CREATE', entityId: { in: businessIds } },
        select: { entityId: true, userId: true, createdAt: true },
      })
    : []

  // Map entityId → auditEntry
  const auditMap = new Map(auditEntries.map(e => [e.entityId, e]))

  // Fetch user names for the userIds found in audit entries
  const userIds = Array.from(new Set(auditEntries.map(e => e.userId)))
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      })
    : []
  const userMap = new Map(users.map(u => [u.id, u]))

  // Detect bulk imports: among accountant-portal businesses in this page,
  // flag a business as "bulk" if another business from the same accountant
  // was created within 5 minutes of it (in the current result set).
  const acctTimestamps = new Map<string, Date[]>()
  for (const b of businesses) {
    if (b.source === 'accountant' && b.accountantId) {
      if (!acctTimestamps.has(b.accountantId)) acctTimestamps.set(b.accountantId, [])
      acctTimestamps.get(b.accountantId)!.push(b.createdAt)
    }
  }

  const isBulk = (b: (typeof businesses)[0]): boolean => {
    if (b.source !== 'accountant' || !b.accountantId) return false
    const times = acctTimestamps.get(b.accountantId) || []
    const t = b.createdAt.getTime()
    return times.some(other => other !== b.createdAt && Math.abs(other.getTime() - t) < 5 * 60 * 1000)
  }

  const rows = businesses.map(b => {
    const audit  = auditMap.get(b.id)
    const user   = audit ? userMap.get(audit.userId) : null
    return {
      id:            b.id,
      afm:           b.afm,
      onomasia:      b.onomasia,
      source:        b.source,
      sourceLabel:   SOURCE_LABELS[b.source] || b.source,
      createdAt:     b.createdAt,
      accountantId:  b.accountantId,
      officeName:    b.accountant?.officeName || null,
      userName:      user?.name || null,
      userEmail:     user?.email || null,
      bulk:          isBulk(b),
    }
  })

  // Facets for filter dropdowns
  const [allSources, allAccountants] = await Promise.all([
    prisma.business.groupBy({ by: ['source'], _count: true, orderBy: { _count: { source: 'desc' } } }),
    prisma.accountant.findMany({ select: { id: true, officeName: true }, orderBy: { officeName: 'asc' } }),
  ])

  return NextResponse.json({ rows, total, page, pageSize: PAGE_SIZE, allSources, allAccountants })
}
