import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const existing = await prisma.clientCase.findUnique({
    where: { id: params.id },
    include: { accountant: { select: { email: true, officeName: true } }, business: { select: { onomasia: true, afm: true } } },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { message } = await request.json()
  if (!message?.trim()) return NextResponse.json({ error: 'Το μήνυμα είναι υποχρεωτικό' }, { status: 400 })

  const clientLabel = existing.business.onomasia || existing.business.afm
  const prefix = `Σχετικά με τον πελάτη: ${clientLabel} (Υπόθεση #${existing.caseNumber})`

  const activity = await prisma.caseActivity.create({
    data: {
      caseId: existing.id,
      type: 'CONTACT_LOG',
      body: `${prefix}\n\n${message.trim()}`,
      internal: false,
      authorId: session.user.id,
      authorName: session.user.name || '',
      authorRole: session.user.role,
    },
  })

  await prisma.clientCase.update({ where: { id: existing.id }, data: { updatedAt: new Date() } })

  const caseUrl = `${process.env.APP_URL || 'https://logistis.i-mentor.gr'}/cases/${existing.id}`
  if (!existing.accountantId) {
    return NextResponse.json({ activity })
  }
  try {
    await prisma.notification.create({
      data: {
        accountantId: existing.accountantId,
        type: 'CASE_UPDATE',
        title: `Μήνυμα από I-MENTOR — Υπόθεση #${existing.caseNumber}`,
        body: `${prefix}\n\n${message.trim()}`,
        link: `/cases/${existing.id}`,
      },
    })
    if (existing.accountant?.email) {
      await sendEmail({
        to: existing.accountant.email,
        subject: `✉️ Μήνυμα από I-MENTOR — Υπόθεση #${existing.caseNumber} (${clientLabel})`,
        html: `<p>${prefix}</p>
          <blockquote style="border-left:4px solid #4f46e5;padding-left:12px;color:#374151">${message.trim().replace(/\n/g, '<br/>')}</blockquote>
          <p><a href="${caseUrl}">Δείτε την υπόθεση →</a></p>`,
      })
    }
  } catch {}

  return NextResponse.json(activity, { status: 201 })
}
