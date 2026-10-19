import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const campaign = await prisma.gemiCampaign.findUnique({ where: { id }, select: { id: true } })
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.gemiCampaign.update({ where: { id }, data: { archivedAt: null } })

  return NextResponse.json({ ok: true })
}
