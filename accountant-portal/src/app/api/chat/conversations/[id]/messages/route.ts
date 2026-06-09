import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const conversation = await prisma.chatConversation.findUnique({
    where: { id: params.id },
    include: {
      accountant: { select: { id: true, officeName: true, contactPerson: true, email: true } },
      business: { select: { id: true, onomasia: true, afm: true } },
      messages: { orderBy: { createdAt: 'asc' } },
    },
  })

  if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isAdmin = session.user.role === 'ADMIN'
  if (!isAdmin && conversation.accountantId !== session.user.accountantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Mark unread messages as read for the current viewer
  const viewerRole = isAdmin ? 'ACCOUNTANT' : 'ADMIN'
  await prisma.chatMessage.updateMany({
    where: { conversationId: params.id, senderRole: viewerRole, readAt: null },
    data: { readAt: new Date() },
  })

  return NextResponse.json(conversation)
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const conversation = await prisma.chatConversation.findUnique({
    where: { id: params.id },
    include: { accountant: { select: { email: true, contactPerson: true, officeName: true } } },
  })

  if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isAdmin = session.user.role === 'ADMIN'
  if (!isAdmin && conversation.accountantId !== session.user.accountantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { body } = await request.json()
  if (!body?.trim()) return NextResponse.json({ error: 'Κενό μήνυμα' }, { status: 400 })

  const message = await prisma.chatMessage.create({
    data: {
      conversationId: params.id,
      senderRole: isAdmin ? 'ADMIN' : 'ACCOUNTANT',
      senderId: session.user.id,
      senderName: session.user.name || (isAdmin ? 'I-MENTOR' : 'Λογιστής'),
      body: body.trim(),
    },
  })

  await prisma.chatConversation.update({
    where: { id: params.id },
    data: { updatedAt: new Date() },
  })

  // Notify by email
  try {
    if (isAdmin) {
      // Admin replied → notify accountant
      await sendEmail({
        to: conversation.accountant.email,
        subject: `💬 Νέο μήνυμα από την I-MENTOR — ${conversation.subject}`,
        html: `<p>Αγαπητέ/ή <strong>${conversation.accountant.contactPerson}</strong>,</p>
          <p>Λάβατε νέο μήνυμα από την I-MENTOR:</p>
          <blockquote style="border-left:4px solid #4f46e5;padding-left:12px;color:#374151">${body}</blockquote>
          <p><a href="${process.env.APP_URL || 'https://logistis.i-mentor.gr'}/chat/${params.id}">Απαντήστε εδώ →</a></p>`,
      })
    } else {
      // Accountant replied → notify admin via email
      await sendEmail({
        to: process.env.ADMIN_EMAIL || 'info@i-mentor.gr',
        subject: `💬 Νέο μήνυμα από λογιστή — ${conversation.accountant.officeName}`,
        html: `<p>Νέο μήνυμα από <strong>${conversation.accountant.officeName}</strong> (${conversation.accountant.contactPerson}):</p>
          <blockquote style="border-left:4px solid #4f46e5;padding-left:12px;color:#374151">${body}</blockquote>
          <p><a href="${process.env.APP_URL || 'https://logistis.i-mentor.gr'}/chat/${params.id}">Απαντήστε εδώ →</a></p>`,
      })
    }
  } catch {}

  return NextResponse.json(message, { status: 201 })
}
