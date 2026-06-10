import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ensureTemplatesSeeded } from '@/lib/template-seed'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await ensureTemplatesSeeded()

  const items = await prisma.messageTemplate.findMany({
    orderBy: [{ channel: 'asc' }, { order: 'asc' }],
  })

  return NextResponse.json(items)
}
