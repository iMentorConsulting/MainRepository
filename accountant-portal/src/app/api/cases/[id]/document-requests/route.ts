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

  const body = await request.json()
  const { category, note } = body
  let categories: string[] = Array.isArray(body.categories) ? body.categories.map((c: string) => c?.trim()).filter(Boolean) : []
  if (categories.length === 0 && category?.trim()) categories = [category.trim()]
  if (categories.length === 0) return NextResponse.json({ error: 'Η κατηγορία εγγράφου είναι υποχρεωτική' }, { status: 400 })

  const docRequests = await Promise.all(categories.map(cat =>
    prisma.caseDocumentRequest.create({
      data: {
        caseId: existing.id,
        category: cat,
        note: note?.trim() || null,
        createdById: session.user.id,
      },
    })
  ))

  const categoriesList = categories.join(', ')
  await prisma.caseActivity.create({
    data: {
      caseId: existing.id,
      type: 'DOCUMENT',
      body: `Ζητήθηκαν τα έγγραφα: ${categoriesList}${note?.trim() ? ` — ${note.trim()}` : ''}`,
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
        title: `Αίτημα Εγγράφων — Υπόθεση #${existing.caseNumber}`,
        body: `Η I-MENTOR ζητά τα παρακάτω έγγραφα για τον πελάτη ${existing.business.onomasia || existing.business.afm}: ${categoriesList}.${note?.trim() ? ` ${note.trim()}` : ''}`,
        link: `/cases/${existing.id}`,
      },
    })
    if (existing.accountant.email) {
      await sendEmail({
        to: existing.accountant.email,
        subject: `📄 Αίτημα Εγγράφων — Υπόθεση #${existing.caseNumber} (${existing.business.onomasia || existing.business.afm})`,
        html: `<p>Η ομάδα I-MENTOR ζητά τα παρακάτω έγγραφα για τον πελάτη <strong>${existing.business.onomasia || existing.business.afm}</strong> (Υπόθεση #${existing.caseNumber}):</p>
          <ul>${categories.map(cat => `<li>${cat}</li>`).join('')}</ul>
          ${note?.trim() ? `<p>${note.trim()}</p>` : ''}
          <p><a href="${caseUrl}">Δείτε την υπόθεση και ανεβάστε τα έγγραφα →</a></p>`,
      })
    }
  } catch {}

  return NextResponse.json(docRequests, { status: 201 })
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
