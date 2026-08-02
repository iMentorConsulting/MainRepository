import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const docs = await prisma.programDocument.findMany({ orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] })
  return NextResponse.json(docs)
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { name, category, instructions } = await request.json()
  if (!name?.trim() || !category) {
    return NextResponse.json({ error: 'Τα πεδία name και category είναι υποχρεωτικά' }, { status: 400 })
  }

  const count = await prisma.programDocument.count()
  const doc = await prisma.programDocument.create({
    data: { name: name.trim(), category, instructions: instructions?.trim() || null, order: count },
  })
  return NextResponse.json(doc, { status: 201 })
}
