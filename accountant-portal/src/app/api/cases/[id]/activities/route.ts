import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await prisma.clientCase.findUnique({
    where: { id: params.id },
    include: { accountant: { select: { officeName: true, email: true } }, business: { select: { onomasia: true, afm: true } } },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isAdmin = session.user.role === 'ADMIN'
  if (!isAdmin && existing.accountantId !== session.user.accountantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { body, internal, notifyAccountant } = await request.json()
  if (!body || !body.trim()) {
    return NextResponse.json({ error: 'Το μήνυμα είναι υποχρεωτικό' }, { status: 400 })
  }

  const activity = await prisma.caseActivity.create({
    data: {
      caseId: existing.id,
      type: 'NOTE',
      body: body.trim(),
      internal: isAdmin ? !!internal : false,
      authorId: session.user.id,
      authorName: session.user.name || '',
      authorRole: session.user.role,
    },
  })

  await prisma.clientCase.update({ where: { id: existing.id }, data: { updatedAt: new Date() } })

  try {
    if (isAdmin && !activity.internal && notifyAccountant && existing.accountantId) {
      await prisma.notification.create({
        data: {
          accountantId: existing.accountantId,
          type: 'CASE_UPDATE',
          title: `Νέο σχόλιο στην Υπόθεση #${existing.caseNumber}`,
          body: body.trim(),
          link: `/cases/${existing.id}`,
        },
      })
      if (existing.accountant?.email) {
        await sendEmail({
          to: existing.accountant.email,
          subject: `🗂️ Νέο σχόλιο στην Υπόθεση #${existing.caseNumber}`,
          html: `<p>Νέο σχόλιο στην υπόθεση <strong>#${existing.caseNumber}</strong> (${existing.business.onomasia || existing.business.afm}):</p>
            <blockquote style="border-left:4px solid #4f46e5;padding-left:12px;color:#374151">${body.trim()}</blockquote>
            <p><a href="${process.env.APP_URL || 'https://logistis.i-mentor.gr'}/cases/${existing.id}">Δείτε την υπόθεση →</a></p>`,
        })
      }
    } else if (!isAdmin) {
      await sendEmail({
        to: process.env.ADMIN_EMAIL || 'info@i-mentor.gr',
        subject: `🗂️ Νέο σχόλιο από λογιστή — Υπόθεση #${existing.caseNumber}`,
        html: `<p>Νέο σχόλιο από <strong>${existing.accountant?.officeName || 'I-MENTOR'}</strong> στην υπόθεση <strong>#${existing.caseNumber}</strong>:</p>
          <blockquote style="border-left:4px solid #4f46e5;padding-left:12px;color:#374151">${body.trim()}</blockquote>
          <p><a href="${process.env.APP_URL || 'https://logistis.i-mentor.gr'}/cases/${existing.id}">Δείτε την υπόθεση →</a></p>`,
      })
    }
  } catch {}

  return NextResponse.json(activity, { status: 201 })
}
