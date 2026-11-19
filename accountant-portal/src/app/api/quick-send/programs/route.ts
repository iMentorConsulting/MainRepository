import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const businessIds = request.nextUrl.searchParams.get('businessIds')?.split(',').filter(Boolean) || []
  if (businessIds.length === 0) return NextResponse.json({ programs: [] })

  // ACCOUNTANTs can only query matches for their own businesses
  const matchWhere: any = { businessId: { in: businessIds } }
  if (session.user.role === 'ACCOUNTANT' && (session.user as any).accountantId) {
    matchWhere.business = { accountantId: (session.user as any).accountantId }
  }

  const matches = await prisma.programMatch.findMany({
    where: matchWhere,
    select: { program: { select: { id: true, title: true } } },
    distinct: ['programId'],
  })

  const programs = matches.map(m => m.program).filter(Boolean)
  return NextResponse.json({ programs })
}
