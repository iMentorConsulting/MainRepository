import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const templates = await prisma.gemiEmailTemplate.findMany({ orderBy: { createdAt: 'desc' } })
  return NextResponse.json(templates)
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { label, description, subject, htmlContent } = await request.json()
  if (!label?.trim() || !subject?.trim()) {
    return NextResponse.json({ error: 'label and subject are required' }, { status: 400 })
  }
  const template = await prisma.gemiEmailTemplate.create({
    data: { label: label.trim(), description: description?.trim() ?? null, subject: subject.trim(), htmlContent: htmlContent ?? '' },
  })
  return NextResponse.json(template, { status: 201 })
}
