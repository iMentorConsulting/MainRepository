import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const services = await prisma.service.findMany({
    where: session.user.role === 'ADMIN' ? {} : { active: true },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(services)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await req.json()
  const service = await prisma.service.create({
    data: {
      name: body.name,
      description: body.description || null,
      price: Math.round(parseFloat(body.price) * 100), // convert euros to cents
      currency: body.currency || 'eur',
      active: body.active ?? true,
    },
  })
  return NextResponse.json(service, { status: 201 })
}
