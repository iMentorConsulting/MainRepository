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
  const { name, wpPageId, htmlTemplate, seoTitlePattern, metaDescPattern, wpMenuParentTitle, categories, placeholders } = data
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  if (!wpPageId && !htmlTemplate) {
    return NextResponse.json({ error: 'Either wpPageId or htmlTemplate is required' }, { status: 400 })
  }
  const template = await prisma.wordpressTemplate.create({
    data: {
      name,
      wpPageId: wpPageId ? Number(wpPageId) : null,
      htmlTemplate: htmlTemplate ?? null,
      seoTitlePattern: seoTitlePattern ?? null,
      metaDescPattern: metaDescPattern ?? null,
      wpMenuParentTitle: wpMenuParentTitle ?? null,
      categories: categories ?? [],
      placeholders: placeholders ?? {},
    },
  })
  return NextResponse.json(template, { status: 201 })
}
