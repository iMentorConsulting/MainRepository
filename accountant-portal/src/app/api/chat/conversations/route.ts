import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isAdmin = session.user.role === 'ADMIN'
  const where = isAdmin ? {} : { accountantId: session.user.accountantId || '' }

  const conversations = await prisma.chatConversation.findMany({
    where,
    include: {
      accountant: { select: { id: true, officeName: true, contactPerson: true } },
      business: { select: { id: true, onomasia: true, afm: true } },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { body: true, createdAt: true, senderRole: true, readAt: true },
      },
    },
    orderBy: { updatedAt: 'desc' },
  })

  return NextResponse.json(conversations)
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isAdmin = session.user.role === 'ADMIN'
  const { subject, businessId, body, accountantId: targetAccountantId } = await request.json()

  if (!subject || !body) {
    return NextResponse.json({ error: 'Θέμα και μήνυμα είναι υποχρεωτικά' }, { status: 400 })
  }

  const resolvedAccountantId = isAdmin ? targetAccountantId : session.user.accountantId
  if (!resolvedAccountantId) {
    return NextResponse.json({ error: 'Δεν βρέθηκε λογιστικό γραφείο' }, { status: 400 })
  }

  const conversation = await prisma.chatConversation.create({
    data: {
      accountantId: resolvedAccountantId,
      businessId: businessId || null,
      subject,
      updatedAt: new Date(),
      messages: {
        create: {
          senderRole: isAdmin ? 'ADMIN' : 'ACCOUNTANT',
          senderId: session.user.id,
          senderName: session.user.name || (isAdmin ? 'I-MENTOR' : 'Λογιστής'),
          body,
        },
      },
    },
    include: {
      accountant: { select: { id: true, officeName: true, contactPerson: true } },
      business: { select: { id: true, onomasia: true, afm: true } },
      messages: true,
    },
  })

  return NextResponse.json(conversation, { status: 201 })
}
