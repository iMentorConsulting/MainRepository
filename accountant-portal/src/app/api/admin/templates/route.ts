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

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { category, label, description, subject } = await request.json()
  if (!category?.trim() || !label?.trim()) {
    return NextResponse.json({ error: 'category and label are required' }, { status: 400 })
  }

  const slug = label
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || `template-${Date.now()}`
  const templateKey = `custom-${slug}-${Date.now()}`

  const maxOrder = await prisma.messageTemplate.aggregate({ _max: { order: true } })
  const order = (maxOrder._max.order ?? 0) + 1

  const base = {
    category: category.trim(),
    label: label.trim(),
    description: description?.trim() || '',
    subject: subject?.trim() || '',
    bodyWithAccountant: '',
    bodyDirect: '',
    order,
  }

  const [email, viber] = await Promise.all([
    prisma.messageTemplate.create({ data: { ...base, channel: 'EMAIL', templateKey: `${templateKey}-email` } }),
    prisma.messageTemplate.create({ data: { ...base, channel: 'VIBER', templateKey: `${templateKey}-viber` } }),
  ])

  return NextResponse.json({ email, viber })
}
