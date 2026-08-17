import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isAdmin = session.user.role === 'ADMIN'
  const canSeeAll = isAdmin || session.user.role === 'CONSULTANT'
  const where = canSeeAll ? {} : { accountantId: session.user.accountantId || '' }

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

  const resolvedAccountantId = isAdmin ? (targetAccountantId || null) : session.user.accountantId
  if (!isAdmin && !resolvedAccountantId) {
    return NextResponse.json({ error: 'Δεν βρέθηκε λογιστικό γραφείο' }, { status: 400 })
  }

  const conversation = await prisma.chatConversation.create({
    data: {
      accountantId: resolvedAccountantId ?? undefined,
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

  // Notify by email
  try {
    if (isAdmin) {
      if (conversation.accountant) {
        const accountantEmail = await prisma.accountant.findUnique({ where: { id: conversation.accountant.id }, select: { email: true } })
        if (accountantEmail?.email) {
          await sendEmail({
            to: accountantEmail.email,
            subject: `💬 Νέο μήνυμα από την I-MENTOR — ${subject}`,
            html: `<p>Αγαπητέ/ή <strong>${conversation.accountant.contactPerson}</strong>,</p>
              <p>Λάβατε νέο μήνυμα από την I-MENTOR:</p>
              <blockquote style="border-left:4px solid #4f46e5;padding-left:12px;color:#374151">${body}</blockquote>
              <p><a href="${process.env.APP_URL || 'https://logistis.i-mentor.gr'}/chat/${conversation.id}">Απαντήστε εδώ →</a></p>`,
          })
        }
      }
    } else if (conversation.accountant) {
      await sendEmail({
        to: process.env.ADMIN_EMAIL || 'info@i-mentor.gr',
        subject: `💬 Νέο μήνυμα από λογιστή — ${conversation.accountant.officeName}`,
        html: `<p>Νέο μήνυμα από <strong>${conversation.accountant.officeName}</strong> (${conversation.accountant.contactPerson}):</p>
          <blockquote style="border-left:4px solid #4f46e5;padding-left:12px;color:#374151">${body}</blockquote>
          <p><a href="${process.env.APP_URL || 'https://logistis.i-mentor.gr'}/chat/${conversation.id}">Απαντήστε εδώ →</a></p>`,
      })
    }
  } catch (err: any) {
    console.error('[Chat] New conversation email notification failed:', err?.message)
  }

  return NextResponse.json(conversation, { status: 201 })
}
