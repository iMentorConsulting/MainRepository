import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accountant = await prisma.accountant.findUnique({
    where: { id: params.id },
    include: {
      users: { select: { id: true, name: true, email: true, role: true } },
      businesses: {
        select: { id: true, afm: true, onomasia: true, postalAreaDescription: true, postalZipCode: true }
      },
    }
  })

  if (!accountant) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(accountant)
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const data = await request.json()
  delete data.id
  delete data.createdAt
  delete data.updatedAt
  delete data.users
  delete data.businesses

  const accountant = await prisma.accountant.update({
    where: { id: params.id },
    data,
  })

  return NextResponse.json(accountant)
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.accountant.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
