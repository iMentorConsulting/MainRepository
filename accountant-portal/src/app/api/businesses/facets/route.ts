import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const where: any = {}
  if (session.user.role === 'ACCOUNTANT' && session.user.accountantId) {
    where.accountantId = session.user.accountantId
  }

  const [legalStatuses, regions, accountants] = await Promise.all([
    prisma.business.findMany({ where, select: { legalStatusDescr: true }, distinct: ['legalStatusDescr'] }),
    prisma.business.findMany({ where, select: { postalAreaDescription: true }, distinct: ['postalAreaDescription'] }),
    session.user.role === 'ADMIN'
      ? prisma.accountant.findMany({ select: { id: true, officeName: true }, orderBy: { officeName: 'asc' } })
      : Promise.resolve([]),
  ])

  return NextResponse.json({
    legalStatuses: legalStatuses.map(l => l.legalStatusDescr).filter((v): v is string => !!v).sort(),
    regions: regions.map(r => r.postalAreaDescription).filter((v): v is string => !!v).sort(),
    accountants,
  })
}
