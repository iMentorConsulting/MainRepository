import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const req = await prisma.imentorRequest.findUnique({
    where: { id: params.id },
    include: {
      accountant: true,
      business: true,
      program: true,
    }
  })

  if (!req) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(req)
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { status } = await request.json()

  const req = await prisma.imentorRequest.update({
    where: { id: params.id },
    data: { status, updatedAt: new Date() },
  })

  return NextResponse.json(req)
}
