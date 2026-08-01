import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session || !['ADMIN', 'CONSULTANT'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { ids, tag, action } = await request.json()
  if (!Array.isArray(ids) || ids.length === 0 || !tag?.trim() || !['add', 'remove'].includes(action)) {
    return NextResponse.json({ error: 'ids, tag and action (add|remove) required' }, { status: 400 })
  }

  const cleanTag = String(tag).trim()
  const idList = ids.map((id: string) => Prisma.sql`${id}`)

  if (action === 'add') {
    await prisma.$executeRaw`
      UPDATE "GemiLookup"
      SET tags = array_append(tags, ${cleanTag}::text)
      WHERE id = ANY(ARRAY[${Prisma.join(idList)}])
        AND NOT (${cleanTag}::text = ANY(tags))
    `
  } else {
    await prisma.$executeRaw`
      UPDATE "GemiLookup"
      SET tags = array_remove(tags, ${cleanTag}::text)
      WHERE id = ANY(ARRAY[${Prisma.join(idList)}])
    `
  }

  return NextResponse.json({ ok: true })
}
