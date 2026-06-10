import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const items = await prisma.rejectionReason.findMany({ orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] })
  return NextResponse.json(items)
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { label, programIds } = await request.json()
  if (!label?.trim()) return NextResponse.json({ error: 'Το πεδίο είναι υποχρεωτικό' }, { status: 400 })

  const count = await prisma.rejectionReason.count()
  const item = await prisma.rejectionReason.create({ data: { label: label.trim(), order: count, programIds: Array.isArray(programIds) ? programIds : [] } })
  return NextResponse.json(item, { status: 201 })
}
