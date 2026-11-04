import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const search = request.nextUrl.searchParams.get('search') || ''

  const contracts = await prisma.accountantContract.findMany({
    where: search
      ? {
          OR: [
            { officeOnomasia: { contains: search, mode: 'insensitive' } },
            { officeAfm: { contains: search, mode: 'insensitive' } },
            { signerName: { contains: search, mode: 'insensitive' } },
            { uniqueCode: { contains: search, mode: 'insensitive' } },
          ],
        }
      : undefined,
    include: { accountant: { select: { officeName: true, email: true } } },
    orderBy: { signedAt: 'desc' },
  })

  return NextResponse.json({ contracts })
}
