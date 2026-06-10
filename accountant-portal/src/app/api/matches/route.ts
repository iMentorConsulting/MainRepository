import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const SORTABLE = new Set(['matchScore', 'createdAt', 'status', 'business.onomasia', 'business.afm', 'program.title', 'business.accountant.officeName'])

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const page = parseInt(searchParams.get('page') || '1')
  const limit = Math.min(parseInt(searchParams.get('limit') || '25'), 200)
  const status = searchParams.get('status') || ''
  const accountantIds = searchParams.get('accountantIds')?.split(',').filter(Boolean) || []
  const programIds = searchParams.get('programIds')?.split(',').filter(Boolean) || []
  const legalStatuses = searchParams.get('legalStatuses')?.split(',').filter(Boolean) || []
  const search = searchParams.get('search') || ''
  const sortBy = searchParams.get('sortBy') || 'matchScore'
  const sortDir = (searchParams.get('sortDir') || 'desc') === 'asc' ? 'asc' : 'desc'
  const skip = (page - 1) * limit

  const where: any = {}
  if (status) where.status = status
  if (programIds.length > 0) where.programId = { in: programIds }

  const businessFilter: any = {}
  if (session.user.role === 'ACCOUNTANT' && session.user.accountantId) {
    // Always enforce the session accountant — ignore any client-supplied accountantIds
    businessFilter.accountantId = session.user.accountantId
  } else if (session.user.role === 'ADMIN' && accountantIds.length > 0) {
    businessFilter.accountantId = { in: accountantIds }
  }
  if (legalStatuses.length > 0) businessFilter.legalStatusDescr = { in: legalStatuses }
  if (search) {
    businessFilter.OR = [
      { onomasia: { contains: search, mode: 'insensitive' } },
      { afm: { contains: search, mode: 'insensitive' } },
    ]
  }
  if (Object.keys(businessFilter).length > 0) where.business = businessFilter

  const safeSort = SORTABLE.has(sortBy) ? sortBy : 'matchScore'
  let orderBy: any = { [safeSort]: sortDir }
  if (safeSort === 'business.onomasia') orderBy = { business: { onomasia: sortDir } }
  else if (safeSort === 'business.afm') orderBy = { business: { afm: sortDir } }
  else if (safeSort === 'program.title') orderBy = { program: { title: sortDir } }
  else if (safeSort === 'business.accountant.officeName') orderBy = { business: { accountant: { officeName: sortDir } } }

  const [matches, total] = await Promise.all([
    prisma.programMatch.findMany({
      where,
      skip,
      take: limit,
      include: {
        business: {
          select: {
            id: true,
            afm: true,
            onomasia: true,
            accountant: { select: { id: true, officeName: true, contactPerson: true } },
            campaignRecipients: {
              where: { sentAt: { not: null } },
              orderBy: { sentAt: 'desc' },
              take: 1,
              select: { sentAt: true, campaign: { select: { programId: true, title: true } } },
            },
          },
        },
        program: { select: { id: true, title: true, category: true } },
      },
      orderBy,
    }),
    prisma.programMatch.count({ where }),
  ])

  // For admin: also return facets for filters
  let accountants: any[] = []
  let programs: any[] = []
  if (session.user.role === 'ADMIN') {
    const [accs, progs] = await Promise.all([
      prisma.accountant.findMany({ select: { id: true, officeName: true }, orderBy: { officeName: 'asc' } }),
      prisma.program.findMany({ select: { id: true, title: true }, orderBy: { title: 'asc' } }),
    ])
    accountants = accs
    programs = progs
  }

  const legalStatusFacet = await prisma.business.findMany({
    where: businessFilter.accountantId ? { accountantId: businessFilter.accountantId } : {},
    select: { legalStatusDescr: true },
    distinct: ['legalStatusDescr'],
  })
  const legalStatusOptions = legalStatusFacet.map(l => l.legalStatusDescr).filter((v): v is string => !!v).sort()

  return NextResponse.json({ matches, total, page, limit, accountants, programs, legalStatuses: legalStatusOptions })
}
