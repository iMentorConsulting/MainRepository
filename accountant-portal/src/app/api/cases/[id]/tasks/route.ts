import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function loadCase(id: string) {
  return prisma.clientCase.findUnique({ where: { id }, select: { id: true, accountantId: true, caseNumber: true } })
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const existing = await loadCase(params.id)
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { title } = await request.json()
  if (!title?.trim()) return NextResponse.json({ error: 'Ο τίτλος είναι υποχρεωτικός' }, { status: 400 })

  const count = await prisma.caseTask.count({ where: { caseId: existing.id } })
  const task = await prisma.caseTask.create({
    data: { caseId: existing.id, title: title.trim(), order: count, createdById: session.user.id },
  })
  return NextResponse.json(task, { status: 201 })
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const existing = await loadCase(params.id)
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { taskId, done, title } = await request.json()
  if (!taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 })

  const data: any = {}
  if (typeof done === 'boolean') {
    data.done = done
    data.doneAt = done ? new Date() : null
  }
  if (typeof title === 'string' && title.trim()) data.title = title.trim()

  const task = await prisma.caseTask.update({ where: { id: taskId }, data })
  return NextResponse.json(task)
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const existing = await loadCase(params.id)
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const taskId = request.nextUrl.searchParams.get('taskId')
  if (!taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 })

  await prisma.caseTask.delete({ where: { id: taskId } })
  return NextResponse.json({ success: true })
}
