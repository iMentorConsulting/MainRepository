import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'

const MAX_DATA_URL = 14 * 1024 * 1024 // ~10MB file as base64

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await prisma.clientCase.findUnique({
    where: { id: params.id },
    include: { accountant: { select: { officeName: true } }, business: { select: { onomasia: true, afm: true } } },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isAdmin = session.user.role === 'ADMIN'
  if (!isAdmin && existing.accountantId !== session.user.accountantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { category, fileName, dataUrl, requestId } = await request.json()
  if (!category?.trim() || !fileName || !dataUrl) {
    return NextResponse.json({ error: 'Κατηγορία και αρχείο είναι υποχρεωτικά' }, { status: 400 })
  }
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:') || dataUrl.length > MAX_DATA_URL) {
    return NextResponse.json({ error: 'Μη έγκυρο αρχείο (μέγιστο 10MB)' }, { status: 400 })
  }

  const doc = await prisma.caseDocument.create({
    data: {
      caseId: existing.id,
      category: category.trim(),
      fileName,
      dataUrl,
      uploadedById: session.user.id,
      uploadedByName: session.user.name || '',
      uploadedByRole: session.user.role,
      requestId: requestId || null,
    },
  })

  if (requestId) {
    await prisma.caseDocumentRequest.updateMany({
      where: { id: requestId, caseId: existing.id },
      data: { status: 'UPLOADED', fulfilledAt: new Date() },
    }).catch(() => {})
  }

  await prisma.caseActivity.create({
    data: {
      caseId: existing.id,
      type: 'DOCUMENT',
      body: `Ανέβηκε έγγραφο «${category.trim()}» (${fileName})`,
      authorId: session.user.id,
      authorName: session.user.name || '',
      authorRole: session.user.role,
    },
  })
  await prisma.clientCase.update({ where: { id: existing.id }, data: { updatedAt: new Date() } })

  // Uploads from the accountant notify the admin team
  if (!isAdmin) {
    try {
      await sendEmail({
        to: process.env.ADMIN_EMAIL || 'info@i-mentor.gr',
        subject: `📎 Νέο έγγραφο στην Υπόθεση #${existing.caseNumber} — ${category.trim()}`,
        html: `<p>Ο/Η <strong>${existing.accountant?.officeName || 'I-MENTOR'}</strong> ανέβασε το έγγραφο <strong>${category.trim()}</strong> (${fileName}) για τον πελάτη <strong>${existing.business.onomasia || existing.business.afm}</strong>.</p>
          <p><a href="${process.env.APP_URL || 'https://logistis.i-mentor.gr'}/cases/${existing.id}">Δείτε την υπόθεση →</a></p>`,
      })
    } catch {}
  }

  return NextResponse.json({ ...doc, dataUrl: undefined }, { status: 201 })
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await prisma.clientCase.findUnique({ where: { id: params.id }, select: { id: true, accountantId: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role !== 'ADMIN' && existing.accountantId !== session.user.accountantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Single document download (with dataUrl) when ?documentId= is passed
  const documentId = request.nextUrl.searchParams.get('documentId')
  if (documentId) {
    const doc = await prisma.caseDocument.findFirst({ where: { id: documentId, caseId: existing.id } })
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(doc)
  }

  const docs = await prisma.caseDocument.findMany({
    where: { caseId: existing.id },
    select: { id: true, category: true, fileName: true, uploadedByName: true, uploadedByRole: true, requestId: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(docs)
}
