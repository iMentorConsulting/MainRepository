import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { businessAlreadyReceivedProgram } from '@/lib/matching'

// POST /api/admin/cleanup-service-matches
// One-off: removes POTENTIAL matches for businesses that have already received the service.
export async function POST(_req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const businesses = await prisma.business.findMany({
    where: { iMentorServices: { isEmpty: false } },
    select: { id: true, iMentorServices: true },
  })

  const programs = await prisma.program.findMany({ select: { id: true, title: true } })
  let removed = 0

  for (const business of businesses) {
    for (const program of programs) {
      if (businessAlreadyReceivedProgram(business.iMentorServices, program.title)) {
        const { count } = await prisma.programMatch.deleteMany({
          where: { businessId: business.id, programId: program.id, status: 'POTENTIAL' },
        })
        removed += count
      }
    }
  }

  return NextResponse.json({ removed })
}
