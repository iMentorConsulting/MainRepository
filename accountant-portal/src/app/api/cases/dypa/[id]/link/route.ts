import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createAndSendDypaLink } from '@/lib/dypa-link'

// Generates a fresh, time-limited public link the accountant can send to the
// business so it can fill in the entire ΔΥΠΑ assignment wizard itself, and
// notifies the business by email/Viber on behalf of I-MENTOR + the accountant.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const assignment = await prisma.dypaAssignment.findUnique({
    where: { id: params.id },
    include: {
      clientCase: {
        select: {
          accountantId: true,
          accountant: { select: { officeName: true } },
          business: { select: { onomasia: true, afm: true, email: true, phone: true } },
        },
      },
    },
  })
  if (!assignment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isAdmin = session.user.role === 'ADMIN'
  if (!isAdmin && assignment.clientCase.accountantId !== session.user.accountantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const contactEmail = (body.contactEmail || assignment.clientCase.business?.email || '').trim()
  const contactPhone = (body.contactPhone || assignment.clientCase.business?.phone || '').trim()
  const businessName = assignment.clientCase.business?.onomasia || assignment.clientCase.business?.afm || ''
  const officeName = assignment.clientCase.accountant?.officeName || ''

  const { url, formToken } = await createAndSendDypaLink({
    assignmentId: assignment.id,
    businessName,
    officeName,
    contactEmail,
    contactPhone,
  })

  return NextResponse.json({ url, expiresAt: formToken.expiresAt, notifying: !!(contactEmail || contactPhone) })
}
