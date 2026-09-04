import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { sendEmail } from '@/lib/email'
import { notifyCaseManagement } from '@/lib/case-management-sync'
import { buildBusinessProfilePayload, BUSINESS_PROFILE_SELECT } from '@/lib/business-profile'

// Creates a ClientCase (requestType DYPA_HIRING) together with its 1-1
// DypaAssignment extension, for the ΔΥΠΑ hiring-subsidy assignment workflow.
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { businessId, programId } = await request.json()
  if (!businessId) return NextResponse.json({ error: 'Η επιχείρηση είναι υποχρεωτική' }, { status: 400 })
  if (!programId) return NextResponse.json({ error: 'Το πρόγραμμα είναι υποχρεωτικό' }, { status: 400 })

  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { accountantId: true, phone: true, email: true, ...BUSINESS_PROFILE_SELECT } })
  if (!business) return NextResponse.json({ error: 'Δεν βρέθηκε η επιχείρηση' }, { status: 404 })

  const match = await prisma.programMatch.findUnique({
    where: { programId_businessId: { programId, businessId } },
    include: { program: { select: { title: true, category: true } } },
  })
  if (!match || match.status === 'REJECTED') {
    return NextResponse.json({ error: 'Το πρόγραμμα δεν κάνει match με την επιχείρηση' }, { status: 400 })
  }
  if (match.program.category !== 'DYPA') {
    return NextResponse.json({ error: 'Το πρόγραμμα δεν είναι κατηγορίας ΔΥΠΑ' }, { status: 400 })
  }

  let accountantId: string | null
  if (session.user.role === 'ADMIN') {
    accountantId = business.accountantId || null
  } else {
    if (!session.user.accountantId || business.accountantId !== session.user.accountantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    accountantId = session.user.accountantId
  }

  const title = `Ανάθεση Πρόσληψης Ανέργου ΔΥΠΑ — ${business.onomasia || business.afm}`

  const clientCase = await prisma.clientCase.create({
    data: {
      accountantId,
      businessId,
      programId,
      requestType: 'DYPA_HIRING',
      title,
      status: 'NEW',
      createdById: session.user.id,
      activities: {
        create: {
          type: 'CREATED',
          body: 'Δημιουργήθηκε ανάθεση επιδότησης πρόσληψης ανέργου ΔΥΠΑ.',
          authorId: session.user.id,
          authorName: session.user.name || '',
          authorRole: session.user.role,
        },
      },
      dypaAssignment: { create: {} },
    },
    include: {
      accountant: { select: { id: true, officeName: true } },
      business: { select: { id: true, afm: true, onomasia: true } },
      program: { select: { id: true, title: true } },
      dypaAssignment: true,
    },
  })

  await createAuditLog({
    userId: session.user.id,
    action: 'CREATE',
    entity: 'ClientCase',
    entityId: clientCase.id,
    details: `Νέα ανάθεση ΔΥΠΑ #${clientCase.caseNumber} — ${business.onomasia || business.afm}`,
  })

  const appUrl = process.env.APP_URL || 'https://logistis.i-mentor.gr'
  const dypaAssignmentId = clientCase.dypaAssignment!.id
  const businessName = business.onomasia || business.afm || ''
  const officeName = clientCase.accountant?.officeName || ''

  try {
    await sendEmail({
      to: process.env.ADMIN_EMAIL || 'info@i-mentor.gr',
      subject: `🧑‍💼 Νέα Ανάθεση ΔΥΠΑ #${clientCase.caseNumber} — ${officeName || 'I-MENTOR (Direct)'}`,
      html: `<p>Νέα ανάθεση επιδότησης πρόσληψης ανέργου ΔΥΠΑ από <strong>${officeName || 'I-MENTOR (Direct)'}</strong> για τον πελάτη <strong>${businessName}</strong>:</p>
        <p><a href="${appUrl}/cases/dypa/${dypaAssignmentId}">Δείτε την ανάθεση →</a></p>`,
    })
  } catch {}

  // Note: the questionnaire link is sent manually via the case detail page
  // ("Δημιουργία & Αποστολή Συνδέσμου"). Auto-sending here caused duplicate
  // emails whenever the user also clicked that button after creation.

  const profile = await buildBusinessProfilePayload(business)
  notifyCaseManagement({
    caseNumber: clientCase.caseNumber,
    phone: business.phone || null,
    email: business.email || null,
    accountantOffice: clientCase.accountant?.officeName || null,
    caseType: 'ΔΥΠΑ — Ανάθεση Πρόσληψης Ανέργου',
    description: null,
    priority: 'NORMAL',
    programTitle: clientCase.program?.title || null,
    program_exact_title: clientCase.program?.title || null,
    ...profile,
  }).catch(err => console.error('[CaseManagement] notify failed:', err?.message))

  return NextResponse.json({ id: clientCase.dypaAssignment!.id, clientCaseId: clientCase.id }, { status: 201 })
}
