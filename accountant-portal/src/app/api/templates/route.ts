import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ensureTemplatesSeeded } from '@/lib/template-seed'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await ensureTemplatesSeeded()

  const channel = request.nextUrl.searchParams.get('channel') === 'VIBER' ? 'VIBER' : 'EMAIL'
  const items = await prisma.messageTemplate.findMany({
    where: { channel, active: true },
    orderBy: { order: 'asc' },
  })

  return NextResponse.json(items.map(t => ({
    id: t.templateKey,
    label: t.label,
    description: t.description,
    subject: t.subject,
    bodyWithAccountant: t.bodyWithAccountant,
    bodyDirect: t.bodyDirect,
  })))
}
