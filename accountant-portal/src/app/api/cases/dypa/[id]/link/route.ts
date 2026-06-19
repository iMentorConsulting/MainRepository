import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Generates a fresh, time-limited public link the accountant can send to the
// business so it can fill in the entire ΔΥΠΑ assignment wizard itself.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const assignment = await prisma.dypaAssignment.findUnique({
    where: { id: params.id },
    include: { clientCase: { select: { accountantId: true } } },
  })
  if (!assignment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isAdmin = session.user.role === 'ADMIN'
  if (!isAdmin && assignment.clientCase.accountantId !== session.user.accountantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
  const formToken = await prisma.dypaFormToken.create({
    data: { dypaAssignmentId: assignment.id, expiresAt },
  })

  const url = `${process.env.APP_URL || 'https://logistis.i-mentor.gr'}/dypa/${formToken.token}`
  return NextResponse.json({ url, expiresAt: formToken.expiresAt })
}
