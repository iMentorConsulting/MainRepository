import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } }
) {
  const session = await prisma.widgetSession.findUnique({
    where: { token: params.token },
    select: { afm: true, clientName: true, email: true, phone: true, expiresAt: true },
  })

  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.expiresAt && session.expiresAt < new Date()) {
    return NextResponse.json({ error: 'Link expired' }, { status: 410 })
  }

  return NextResponse.json({
    afm: session.afm,
    clientName: session.clientName,
    email: session.email,
    phone: session.phone,
  })
}
