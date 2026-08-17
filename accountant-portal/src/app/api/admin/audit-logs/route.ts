import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const DB_SORTABLE = new Set(['createdAt', 'action', 'entity', 'details'])
const JS_SORTABLE = new Set(['user', 'accountant', 'target'])
// Safety cap when sorting on enriched (non-DB) columns or building chart data
const SORT_CAP = 10000

function csv(v: string | null): string[] {
  return (v || '').split(',').filter(Boolean)
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = request.nextUrl
  const page = parseInt(searchParams.get('page') || '1')
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
  const skip = (page - 1) * limit

  const userIds = csv(searchParams.get('userIds'))
  const accountantIds = csv(searchParams.get('accountantIds'))
  const actions = csv(searchParams.get('actions'))
  const entities = csv(searchParams.get('entities'))
  const dateFrom = searchParams.get('dateFrom') || ''
  const dateTo = searchParams.get('dateTo') || ''
  const search = searchParams.get('search') || ''
  const sortBy = searchParams.get('sortBy') || 'createdAt'
  const sortDir = searchParams.get('sortDir') === 'asc' ? 'asc' : 'desc'
  const chart = searchParams.get('chart') === '1'

  const where: any = {}

  if (userIds.length > 0) {
    where.userId = { in: userIds }
  } else if (accountantIds.length > 0) {
    const users = await prisma.user.findMany({ where: { accountantId: { in: accountantIds } }, select: { id: true } })
    where.userId = { in: users.map(u => u.id) }
  }

  if (actions.length > 0) where.action = { in: actions }
  if (entities.length > 0) where.entity = { in: entities }
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

  // User lookup map (users are few — fetch all once, reused everywhere below)
  const allUsers = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, accountant: { select: { id: true, officeName: true } } },
    orderBy: { name: 'asc' },
  })
  const userMap = new Map(allUsers.map(u => [u.id, u]))

  // ---- Chart mode: activity counts per day, grouped by accountant ----
  if (chart) {
    const rows = await prisma.auditLog.findMany({
      where,
      select: { createdAt: true, userId: true },
      orderBy: { createdAt: 'asc' },
      take: SORT_CAP * 5,
    })
    const series: Record<string, Record<string, number>> = {}
    for (const r of rows) {
      const day = r.createdAt.toISOString().slice(0, 10)
      const u = userMap.get(r.userId)
      const key = u?.accountant?.officeName || u?.name || 'Άγνωστος'
      series[day] = series[day] || {}
      series[day][key] = (series[day][key] || 0) + 1
    }
    const days = Object.keys(series).sort()
    const keys = Array.from(new Set(days.flatMap(d => Object.keys(series[d]))))
    const data = days.map(day => ({ day, ...keys.reduce((acc, k) => ({ ...acc, [k]: series[day][k] || 0 }), {}) }))
    return NextResponse.json({ data, keys })
  }

  // ---- List mode ----
  let logs: any[]
  let total: number

  if (JS_SORTABLE.has(sortBy)) {
    // Sorting on enriched columns: fetch (capped), enrich, sort, slice.
    const all = await prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: SORT_CAP })
    total = await prisma.auditLog.count({ where })
    const businessIds = all.filter(l => l.entity === 'Business' && l.entityId).map(l => l.entityId as string)
    const businesses = await prisma.business.findMany({
      where: { id: { in: Array.from(new Set(businessIds)) } },
      select: { id: true, onomasia: true, afm: true },
    })
    const bizMap = new Map(businesses.map(b => [b.id, b]))
    const enriched = all.map(l => enrich(l, userMap, bizMap))
    const keyOf = (l: any) =>
      sortBy === 'user' ? (l.user?.name || '') :
      sortBy === 'accountant' ? (l.user?.accountant?.officeName || '') :
      (l.target?.name || '')
    enriched.sort((a, b) => keyOf(a).localeCompare(keyOf(b), 'el') * (sortDir === 'asc' ? 1 : -1))
    logs = enriched.slice(skip, skip + limit)
  } else {
    const orderBy: any = DB_SORTABLE.has(sortBy) ? { [sortBy]: sortDir } : { createdAt: 'desc' }
    const [rows, count] = await Promise.all([
      prisma.auditLog.findMany({ where, skip, take: limit, orderBy }),
      prisma.auditLog.count({ where }),
    ])
    total = count
    const businessIds = rows.filter(l => l.entity === 'Business' && l.entityId).map(l => l.entityId as string)
    const businesses = await prisma.business.findMany({
      where: { id: { in: Array.from(new Set(businessIds)) } },
      select: { id: true, onomasia: true, afm: true },
    })
    const bizMap = new Map(businesses.map(b => [b.id, b]))
    logs = rows.map(l => enrich(l, userMap, bizMap))
  }

  // Facets for filters
  const [actionFacets, entityFacets, accountants] = await Promise.all([
    prisma.auditLog.findMany({ select: { action: true }, distinct: ['action'], orderBy: { action: 'asc' } }),
    prisma.auditLog.findMany({ select: { entity: true }, distinct: ['entity'], orderBy: { entity: 'asc' } }),
    prisma.accountant.findMany({ select: { id: true, officeName: true }, orderBy: { officeName: 'asc' } }),
  ])

  return NextResponse.json({
    logs,
    total,
    page,
    limit,
    actions: actionFacets.map(a => a.action),
    entities: entityFacets.map(e => e.entity),
    accountants,
    users: allUsers.map(u => ({ id: u.id, name: u.name, office: u.accountant?.officeName || null })),
  })
}

function enrich(log: any, userMap: Map<string, any>, bizMap: Map<string, any>) {
  let target: { name: string; href: string | null } | null = null
  if (log.entity === 'Business' && log.entityId) {
    const b = bizMap.get(log.entityId)
    target = b
      ? { name: `${b.onomasia || ''} (ΑΦΜ: ${b.afm})`.trim(), href: `/businesses/${b.id}` }
      : { name: 'Διαγραμμένη επιχείρηση', href: null }
  } else if (log.entity === 'Page') {
    target = { name: log.details || '', href: log.details || null }
  }
  return { ...log, user: userMap.get(log.userId) || null, target }
}
