import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = request.nextUrl
  const page = parseInt(searchParams.get('page') || '1')
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
  const skip = (page - 1) * limit

  const userId = searchParams.get('userId') || ''
  const accountantId = searchParams.get('accountantId') || ''
  const action = searchParams.get('action') || ''
  const entity = searchParams.get('entity') || ''
  const dateFrom = searchParams.get('dateFrom') || ''
  const dateTo = searchParams.get('dateTo') || ''
  const search = searchParams.get('search') || ''

  const where: any = {}

  if (userId) {
    where.userId = userId
  } else if (accountantId) {
    const users = await prisma.user.findMany({ where: { accountantId }, select: { id: true } })
    where.userId = { in: users.map(u => u.id) }
  }

  if (action) where.action = action
  if (entity) where.entity = entity
  if (search) where.details = { contains: search, mode: 'insensitive' }

  if (dateFrom || dateTo) {
    where.createdAt = {}
    if (dateFrom) where.createdAt.gte = new Date(dateFrom)
    if (dateTo) {
      const end = new Date(dateTo)
      end.setHours(23, 59, 59, 999)
      where.createdAt.lte = end
    }
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.auditLog.count({ where }),
  ])

  const userIds = Array.from(new Set(logs.map(l => l.userId)))
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true, role: true, accountant: { select: { id: true, officeName: true } } },
  })
  const userMap = new Map(users.map(u => [u.id, u]))

  const enrichedLogs = logs.map(l => ({
    ...l,
    user: userMap.get(l.userId) || null,
  }))

  // Facets for filters
  const [actions, entities, accountants] = await Promise.all([
    prisma.auditLog.findMany({ select: { action: true }, distinct: ['action'], orderBy: { action: 'asc' } }),
    prisma.auditLog.findMany({ select: { entity: true }, distinct: ['entity'], orderBy: { entity: 'asc' } }),
    prisma.accountant.findMany({ select: { id: true, officeName: true }, orderBy: { officeName: 'asc' } }),
  ])

  return NextResponse.json({
    logs: enrichedLogs,
    total,
    page,
    limit,
    actions: actions.map(a => a.action),
    entities: entities.map(e => e.entity),
    accountants,
  })
}
