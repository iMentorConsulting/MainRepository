import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const source = request.nextUrl.searchParams.get('source') || undefined

  const logs = await prisma.webhookLog.findMany({
    where: source ? { source } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  return NextResponse.json({ logs })
}
