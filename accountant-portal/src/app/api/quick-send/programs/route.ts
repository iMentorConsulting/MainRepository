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
  const matchWhere: any = {
    businessId: { in: businessIds },
    status: { not: 'REJECTED' },
  }
  if (session.user.role === 'ACCOUNTANT' && (session.user as any).accountantId) {
    matchWhere.business = { accountantId: (session.user as any).accountantId }
  }

  const matches = await prisma.programMatch.findMany({
    where: matchWhere,
    select: { businessId: true, programId: true, program: { select: { id: true, title: true } } },
  })

  // Keep only programs matched by ALL selected businesses (intersection)
  const countByProgram = new Map<string, number>()
  const programById = new Map<string, { id: string; title: string }>()
  for (const m of matches) {
    countByProgram.set(m.programId, (countByProgram.get(m.programId) || 0) + 1)
    if (m.program) programById.set(m.programId, m.program)
  }

  const total = businessIds.length
  const programs = Array.from(countByProgram.entries())
    .filter(([, count]) => count >= total)
    .map(([id]) => programById.get(id)!)
    .filter(Boolean)

  return NextResponse.json({ programs })
}
