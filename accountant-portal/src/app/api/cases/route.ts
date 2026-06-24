import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { sendEmail } from '@/lib/email'
import { notifyCaseManagement } from '@/lib/case-management-sync'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const isAdmin = session.user.role === 'ADMIN'
  const isConsultant = session.user.role === 'CONSULTANT'
  const canSeeAll = isAdmin || isConsultant

  const where: any = {}
  if (!canSeeAll) {
    if (!session.user.accountantId) return NextResponse.json({ cases: [] })
    where.accountantId = session.user.accountantId
  } else {
    const statuses = (searchParams.get('statuses') || '').split(',').filter(Boolean)
    const accountantIds = (searchParams.get('accountantIds') || '').split(',').filter(Boolean)
    const priorities = (searchParams.get('priorities') || '').split(',').filter(Boolean)
    if (statuses.length) where.status = { in: statuses }
    if (accountantIds.length) where.accountantId = { in: accountantIds }
    if (priorities.length) where.priority = { in: priorities }
  }

  const cases = await prisma.clientCase.findMany({
    where,
    include: {
      accountant: { select: { id: true, officeName: true } },
      business: { select: { id: true, afm: true, onomasia: true } },
      program: { select: { id: true, title: true } },
      activities: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
    orderBy: { createdAt: 'desc' },
  })

  let assignees: { id: string; name: string }[] = []
  if (isAdmin) {
    assignees = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
  }

  const accountants = isAdmin
    ? await prisma.accountant.findMany({ select: { id: true, officeName: true }, orderBy: { officeName: 'asc' } })
    : []

  return NextResponse.json({ cases, assignees, accountants })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { businessId, programId, caseType, description, priority } = await request.json()

  if (!businessId) {
    return NextResponse.json({ error: 'Η επιχείρηση είναι υποχρεωτική' }, { status: 400 })
  }

  if (session.user.role === 'ACCOUNTANT' && !programId) {
    return NextResponse.json({ error: 'Το πρόγραμμα είναι υποχρεωτικό' }, { status: 400 })
  }

  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { id: true, accountantId: true, onomasia: true, afm: true, phone: true, email: true } })
  if (!business) return NextResponse.json({ error: 'Δεν βρέθηκε η επιχείρηση' }, { status: 404 })

  // Program (if any) must be a non-rejected match of this business
  let programTitle = ''
  if (programId) {
    const match = await prisma.programMatch.findUnique({
      where: { programId_businessId: { programId, businessId } },
      include: { program: { select: { title: true } } },
    })
    if (!match || match.status === 'REJECTED') {
      return NextResponse.json({ error: 'Το πρόγραμμα δεν κάνει match με την επιχείρηση' }, { status: 400 })
    }
    programTitle = match.program.title
  }

  // Title is generated automatically from client name + program
  const title = `${business.onomasia || business.afm}${programTitle ? ` — ${programTitle}` : ''}`

  let accountantId: string | null
  if (session.user.role === 'ADMIN') {
    // Businesses with no accountant are direct I-MENTOR clients — allow creating
    // a case for them without an accounting office attached.
    accountantId = business.accountantId || null
  } else {
    if (!session.user.accountantId || business.accountantId !== session.user.accountantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    accountantId = session.user.accountantId
  }

  const clientCase = await prisma.clientCase.create({
    data: {
      accountantId,
      businessId,
      programId: programId || null,
      requestType: 'OTHER',
      caseType: caseType || null,
      title,
      description: description || null,
      priority: priority || 'NORMAL',
      status: 'NEW',
      createdById: session.user.id,
      activities: {
        create: {
          type: 'CREATED',
          body: `Η υπόθεση δημιουργήθηκε${description ? `: ${description}` : ''}`,
          authorId: session.user.id,
          authorName: session.user.name || '',
          authorRole: session.user.role,
        },
      },
    },
    include: {
      accountant: { select: { id: true, officeName: true } },
      business: { select: { id: true, afm: true, onomasia: true } },
      program: { select: { id: true, title: true } },
    },
  })

  await createAuditLog({
    userId: session.user.id,
    action: 'CREATE',
    entity: 'ClientCase',
    entityId: clientCase.id,
    details: `Νέα υπόθεση #${clientCase.caseNumber} — ${business.onomasia || business.afm} — ${title}`,
  })

  try {
    await sendEmail({
      to: process.env.ADMIN_EMAIL || 'info@i-mentor.gr',
      subject: `🗂️ Νέα Υπόθεση #${clientCase.caseNumber} — ${clientCase.accountant?.officeName || 'I-MENTOR (Direct)'}`,
      html: `<p>Νέα υπόθεση από <strong>${clientCase.accountant?.officeName || 'I-MENTOR (Direct)'}</strong> για τον πελάτη <strong>${business.onomasia || business.afm}</strong>:</p>
        <p><strong>${title}</strong></p>
        ${description ? `<blockquote style="border-left:4px solid #4f46e5;padding-left:12px;color:#374151">${description}</blockquote>` : ''}
        <p><a href="${process.env.APP_URL || 'https://logistis.i-mentor.gr'}/cases/${clientCase.id}">Δείτε την υπόθεση →</a></p>`,
    })
  } catch {}

  notifyCaseManagement({
    caseNumber: clientCase.caseNumber,
    afm: business.afm,
    onomasia: business.onomasia,
    phone: business.phone || null,
    email: business.email || null,
    accountantOffice: clientCase.accountant?.officeName || null,
    caseType: clientCase.caseType,
    description: clientCase.description,
    priority: clientCase.priority,
    programTitle: clientCase.program?.title || null,
  }).catch(err => console.error('[CaseManagement] notify failed:', err?.message))

  return NextResponse.json(clientCase, { status: 201 })
}
