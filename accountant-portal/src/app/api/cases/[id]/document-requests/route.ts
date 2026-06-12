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

  const { category, note } = await request.json()
  if (!category?.trim()) return NextResponse.json({ error: 'Η κατηγορία εγγράφου είναι υποχρεωτική' }, { status: 400 })

  const docRequest = await prisma.caseDocumentRequest.create({
    data: {
      caseId: existing.id,
      category: category.trim(),
      note: note?.trim() || null,
      createdById: session.user.id,
    },
  })

  await prisma.caseActivity.create({
    data: {
      caseId: existing.id,
      type: 'DOCUMENT',
      body: `Ζητήθηκε έγγραφο «${category.trim()}» από τον λογιστή${note?.trim() ? ` — ${note.trim()}` : ''}`,
      authorId: session.user.id,
      authorName: session.user.name || '',
      authorRole: session.user.role,
    },
  })
  await prisma.clientCase.update({ where: { id: existing.id }, data: { updatedAt: new Date() } })

  const caseUrl = `${process.env.APP_URL || 'https://logistis.i-mentor.gr'}/cases/${existing.id}`
  try {
    await prisma.notification.create({
      data: {
        accountantId: existing.accountantId,
        type: 'CASE_DOCUMENT_REQUEST',
        title: `Ζητήθηκε έγγραφο — Υπόθεση #${existing.caseNumber}`,
        body: `Η I-MENTOR ζητά το έγγραφο «${category.trim()}» για τον πελάτη ${existing.business.onomasia || existing.business.afm}.${note?.trim() ? ` ${note.trim()}` : ''}`,
        link: `/cases/${existing.id}`,
      },
    })
    if (existing.accountant.email) {
      await sendEmail({
        to: existing.accountant.email,
        subject: `📎 Ζητήθηκε έγγραφο «${category.trim()}» — Υπόθεση #${existing.caseNumber}`,
        html: `<p>Η I-MENTOR ζητά το έγγραφο <strong>${category.trim()}</strong> για τον πελάτη <strong>${existing.business.onomasia || existing.business.afm}</strong>.</p>
          ${note?.trim() ? `<blockquote style="border-left:4px solid #4f46e5;padding-left:12px;color:#374151">${note.trim()}</blockquote>` : ''}
          <p>Μπορείτε να το ανεβάσετε εύκολα ακολουθώντας τον σύνδεσμο:</p>
          <p><a href="${caseUrl}">Μετάβαση στην υπόθεση & ανέβασμα εγγράφου →</a></p>`,
      })
    }
  } catch {}

  return NextResponse.json(docRequest, { status: 201 })
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const requestId = request.nextUrl.searchParams.get('requestId')
  if (!requestId) return NextResponse.json({ error: 'requestId required' }, { status: 400 })

  await prisma.caseDocumentRequest.deleteMany({ where: { id: requestId, caseId: params.id } })
  return NextResponse.json({ success: true })
}
