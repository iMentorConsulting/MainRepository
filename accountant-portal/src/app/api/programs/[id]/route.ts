import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { runMatchingForProgram } from '@/lib/matching'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isAccountant = session.user.role === 'ACCOUNTANT'
  const accountantId = (session.user as any).accountantId as string | null

  const matchWhere = isAccountant && accountantId
    ? { programId: params.id, business: { accountantId }, status: { not: 'REJECTED' as const } }
    : { programId: params.id, status: { not: 'REJECTED' as const } }

  const program = await prisma.program.findUnique({
    where: { id: params.id },
    include: {
      matches: {
        where: matchWhere,
        include: { business: { select: { id: true, afm: true, onomasia: true, accountantId: true, accountant: { select: { officeName: true } } } } },
        orderBy: { matchScore: 'desc' },
        take: 500,
      },
      // ACCOUNTANTs should not see other accountants' campaigns for this program
      campaigns: isAccountant && accountantId
        ? { where: { accountantId }, select: { id: true, title: true, status: true, sentAt: true } }
        : { select: { id: true, title: true, status: true, sentAt: true } },
      _count: { select: { matches: { where: matchWhere } } },
    }
  })

  if (!program) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(program)
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const data = await request.json()
  delete data.id; delete data.matches; delete data.campaigns; delete data.requests
  delete data.createdAt; delete data.updatedAt; delete data._count

  if (data.startDate) data.startDate = new Date(data.startDate)
  else data.startDate = null
  if (data.endDate) data.endDate = new Date(data.endDate)
  else data.endDate = null

  const program = await prisma.program.update({ where: { id: params.id }, data })

  // Eligibility criteria (ΚΑΔ, περιφέρεια, ΤΚ, ημ. ίδρυσης, tags κ.λπ.) may have
  // just changed — re-run matching so stale matches that no longer qualify are
  // dropped and newly-qualifying businesses are picked up, same as on create.
  if (program.active) {
    runMatchingForProgram(program.id).catch(err => console.error('[Matching] Re-match after program edit failed:', err?.message))
  }

  return NextResponse.json(program)
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Delete dependent records before the program (no cascade set on these relations)
  await prisma.$transaction([
    prisma.programMatch.deleteMany({ where: { programId: params.id } }),
    prisma.imentorRequest.deleteMany({ where: { programId: params.id } }),
    prisma.paymentRequest.deleteMany({ where: { programId: params.id } }),
    prisma.commissionPolicy.deleteMany({ where: { programId: params.id } }),
    prisma.program.delete({ where: { id: params.id } }),
  ])
  return NextResponse.json({ success: true })
}
