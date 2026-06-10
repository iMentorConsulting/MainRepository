import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const where: any = {}
  if (session.user.role === 'ACCOUNTANT' && session.user.accountantId) {
    where.accountantId = session.user.accountantId
  }

  const requests = await prisma.imentorRequest.findMany({
    where,
    include: {
      accountant: { select: { id: true, officeName: true, contactPerson: true } },
      business: { select: { id: true, afm: true, onomasia: true } },
      program: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ requests })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ACCOUNTANT') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!session.user.accountantId) {
    return NextResponse.json({ error: 'No accountant profile' }, { status: 400 })
  }

  const { businessId, programId, subject, message, attachmentUrl, attachmentName } = await request.json()

  if (businessId) {
    const business = await prisma.business.findUnique({ where: { id: businessId }, select: { accountantId: true } })
    if (!business || business.accountantId !== session.user.accountantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024 // 10MB
  if (attachmentUrl && typeof attachmentUrl === 'string') {
    // Base64 data URLs are ~33% larger than the raw bytes they encode.
    const approxBytes = attachmentUrl.length * 0.75
    if (approxBytes > MAX_ATTACHMENT_BYTES) {
      return NextResponse.json({ error: 'Το συνημμένο αρχείο υπερβαίνει το όριο των 10MB' }, { status: 413 })
    }
  }

  const req = await prisma.imentorRequest.create({
    data: {
      accountantId: session.user.accountantId,
      businessId,
      programId: programId || null,
      subject,
      message,
      attachmentUrl: attachmentUrl || null,
      attachmentName: attachmentName || null,
      status: 'NEW',
    },
    include: {
      accountant: { select: { id: true, officeName: true } },
      business: { select: { id: true, afm: true, onomasia: true } },
    }
  })

  return NextResponse.json(req, { status: 201 })
}
