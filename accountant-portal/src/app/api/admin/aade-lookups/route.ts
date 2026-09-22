import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const afm = request.nextUrl.searchParams.get('afm')?.trim().replace(/\D/g, '') || undefined

  const [lookups, count] = await Promise.all([
    prisma.aadeLookupLog.findMany({
      where: afm ? { afm } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    afm
      ? prisma.aadeLookupLog.count({ where: { afm } })
      : Promise.resolve(null),
  ])

  return NextResponse.json({ lookups, count })
}
