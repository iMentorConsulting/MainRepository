import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const DEFAULT_QUESTIONS = [
  'Έχει ληξιπρόθεσμες οφειλές προς Δημόσιο / Τράπεζες;',
  'Έχει πτωχευτική διαδικασία σε εκκρεμότητα;',
]

async function ensureSeeded() {
  const count = await prisma.exodikastikosQuestionOption.count()
  if (count === 0) {
    await prisma.exodikastikosQuestionOption.createMany({
      data: DEFAULT_QUESTIONS.map((label, order) => ({ label, order })),
    })
  }
}

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await ensureSeeded().catch(() => {})
  const items = await prisma.exodikastikosQuestionOption.findMany({ orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] })
  return NextResponse.json(items)
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { label } = await request.json()
  if (!label?.trim()) return NextResponse.json({ error: 'Το πεδίο είναι υποχρεωτικό' }, { status: 400 })

  const count = await prisma.exodikastikosQuestionOption.count()
  const item = await prisma.exodikastikosQuestionOption.create({ data: { label: label.trim(), order: count } })
  return NextResponse.json(item, { status: 201 })
}
