import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { runMatchingForProgram } from '@/lib/matching'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const programs = await prisma.program.findMany({
    include: { _count: { select: { matches: true, campaigns: true } } },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ programs })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const data = await request.json()

  // Convert date strings to Date objects
  if (data.startDate) data.startDate = new Date(data.startDate)
  else delete data.startDate
  if (data.endDate) data.endDate = new Date(data.endDate)
  else delete data.endDate

  const program = await prisma.program.create({ data })

  if (program.active) {
    runMatchingForProgram(program.id).catch(err => console.error('[Matching] Auto-match for new program failed:', err?.message))
  }

  return NextResponse.json(program, { status: 201 })
}
