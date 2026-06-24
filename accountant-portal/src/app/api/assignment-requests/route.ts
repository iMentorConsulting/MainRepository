import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requestNewAssignment } from '@/lib/case-management-sync'

// Lets a consultant/admin ask the inhouse Case Management app to look up a
// prospect by email and open a case for them, without us creating a
// ClientCase on our side first (e.g. when a customer replies to a campaign
// but isn't a client yet). See lib/case-management-sync.ts for the protocol.

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN' && session.user.role !== 'CONSULTANT') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const isAdmin = session.user.role === 'ADMIN'
  const requests = await prisma.assignmentRequest.findMany({
    where: isAdmin ? {} : { requestedById: session.user.id },
    include: {
      requestedBy: { select: { id: true, name: true } },
      case: { select: { id: true, caseNumber: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(requests)
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN' && session.user.role !== 'CONSULTANT') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { email, programTitle, note } = await request.json()
  if (!email?.trim()) {
    return NextResponse.json({ error: 'Το email του πελάτη είναι υποχρεωτικό' }, { status: 400 })
  }

  const created = await prisma.assignmentRequest.create({
    data: {
      email: email.trim(),
      programTitle: programTitle?.trim() || null,
      note: note?.trim() || null,
      requestedById: session.user.id,
    },
  })

  const result = await requestNewAssignment({
    requestRef: created.id,
    email: created.email,
    programTitle: created.programTitle,
    requestedBy: session.user.name || '',
    note: created.note,
  })

  if (!result.ok) {
    await prisma.assignmentRequest.update({ where: { id: created.id }, data: { status: 'FAILED' } })
    return NextResponse.json({ error: result.error || 'Η αποστολή στο Case Management απέτυχε', request: created }, { status: 502 })
  }

  return NextResponse.json(created, { status: 201 })
}
