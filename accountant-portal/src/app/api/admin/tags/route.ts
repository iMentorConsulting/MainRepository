import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ensureTagSuggestionsSeeded, ensureErmisTagsBackfilled, ensureGemiTagsBackfilled } from '@/lib/suggestions-seed'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await ensureTagSuggestionsSeeded().catch(() => {})
  ensureErmisTagsBackfilled().catch(() => {})
  ensureGemiTagsBackfilled().catch(() => {})
  const items = await prisma.tagOption.findMany({ orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] })
  return NextResponse.json(items)
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { label } = await request.json()
  if (!label?.trim()) return NextResponse.json({ error: 'Το πεδίο είναι υποχρεωτικό' }, { status: 400 })

  const count = await prisma.tagOption.count()
  const item = await prisma.tagOption.create({ data: { label: label.trim(), order: count } })
  return NextResponse.json(item, { status: 201 })
}
