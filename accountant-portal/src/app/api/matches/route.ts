import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const SORTABLE = new Set(['matchScore', 'createdAt', 'status', 'business.onomasia'])

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '25')
  const status = searchParams.get('status') || ''
  const accountantIds = searchParams.get('accountantIds')?.split(',').filter(Boolean) || []
  const programIds = searchParams.get('programIds')?.split(',').filter(Boolean) || []
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
  if (Object.keys(businessFilter).length > 0) where.business = businessFilter

  const safeSort = SORTABLE.has(sortBy) ? sortBy : 'matchScore'
  const orderBy: any = safeSort === 'business.onomasia'
    ? { business: { onomasia: sortDir } }
    : { [safeSort]: sortDir }

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

  return NextResponse.json({ matches, total, page, limit, accountants, programs })
}
