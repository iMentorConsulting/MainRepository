import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const businessIds = request.nextUrl.searchParams.get('businessIds')?.split(',').filter(Boolean) || []
  if (businessIds.length === 0) return NextResponse.json({ programs: [] })

  // Find all programs that have at least one match with any of the selected businesses
  const matches = await prisma.programMatch.findMany({
    where: { businessId: { in: businessIds } },
    select: { program: { select: { id: true, title: true } } },
    distinct: ['programId'],
  })

  const programs = matches.map(m => m.program).filter(Boolean)
  return NextResponse.json({ programs })
}
