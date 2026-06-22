import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { MAX_SOURCE_TEXT_CHARS } from '@/lib/ai-extraction'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const examples = await prisma.aiExtractionExample.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, sourceUrl: true, extractedJson: true, createdAt: true },
  })
  return NextResponse.json(examples)
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { sourceText, sourceUrl, extractedJson } = body
  if (typeof sourceText !== 'string' || !extractedJson) {
    return NextResponse.json({ error: 'Απαιτούνται sourceText και extractedJson' }, { status: 400 })
  }

  const example = await prisma.aiExtractionExample.create({
    data: {
      sourceText: sourceText.slice(0, MAX_SOURCE_TEXT_CHARS),
      sourceUrl: sourceUrl || null,
      extractedJson,
      createdById: session.user.id,
    },
  })
  return NextResponse.json(example)
}
