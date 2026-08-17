import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const DEFAULT_TYPES = ['Ε3 2025', 'Ε3 2024', 'Ε1 2025', 'Ε1 2024', 'Βεβαίωση Έναρξης', 'Καταστατικό']

async function ensureSeeded() {
  const count = await prisma.caseDocumentTypeOption.count()
  if (count === 0) {
    await prisma.caseDocumentTypeOption.createMany({
      data: DEFAULT_TYPES.map((label, order) => ({ label, order })),
    })
  }
}

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await ensureSeeded().catch(() => {})
  const items = await prisma.caseDocumentTypeOption.findMany({ orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] })
  return NextResponse.json(items)
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { label } = await request.json()
  if (!label?.trim()) return NextResponse.json({ error: 'Το πεδίο είναι υποχρεωτικό' }, { status: 400 })

  const count = await prisma.caseDocumentTypeOption.count()
  const item = await prisma.caseDocumentTypeOption.create({ data: { label: label.trim(), order: count } })
  return NextResponse.json(item, { status: 201 })
}
