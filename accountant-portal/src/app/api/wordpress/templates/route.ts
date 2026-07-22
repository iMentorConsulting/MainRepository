import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const templates = await prisma.wordpressTemplate.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(templates)
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const data = await request.json()
  const { name, wpPageId, categories, placeholders } = data
  if (!name || !wpPageId) {
    return NextResponse.json({ error: 'name and wpPageId are required' }, { status: 400 })
  }
  const template = await prisma.wordpressTemplate.create({
    data: {
      name,
      wpPageId: Number(wpPageId),
      categories: categories ?? [],
      placeholders: placeholders ?? {},
    },
  })
  return NextResponse.json(template, { status: 201 })
}
