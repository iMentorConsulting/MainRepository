import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { notifyCaseManagement } from '@/lib/case-management-sync'

// Inbound endpoint for Case Management's "request new assignment" feature:
// a consultant working in Case Management asks us to look up a prospect by
// email and open/assign a case for them. We look up the business, create the
// case, notify the accountant, and push it back out via the existing
// case-management webhook (now carrying requestRef) so Case Management can
// correlate its own request to the resulting case.
// Auth: header `x-api-key` must match env CASES_API_KEY (same secret used by
// the existing /api/external/cases integration).

function checkApiKey(request: NextRequest): boolean {
  const key = process.env.CASES_API_KEY
  return !!key && request.headers.get('x-api-key') === key
}

export async function POST(request: NextRequest) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { email, programTitle, requestRef, requestedBy, note } = await request.json()
  if (!email || !requestRef) {
    return NextResponse.json({ error: 'email and requestRef are required' }, { status: 400 })
  }

  const business = await prisma.business.findFirst({
    where: { email },
    include: { accountant: { select: { officeName: true } } },
  })
  if (!business) {
    return NextResponse.json({ error: 'No client found for this email' }, { status: 404 })
  }

  const clientCase = await prisma.clientCase.create({
    data: {
      accountantId: business.accountantId,
      businessId: business.id,
      requestType: 'OTHER',
      title: business.onomasia || business.afm,
      description: note || null,
      status: 'NEW',
      createdById: 'external',
      activities: {
        create: {
          type: 'EXTERNAL',
          body: `Αίτημα ανάθεσης από το Case Management${requestedBy ? ` (${requestedBy})` : ''}${note ? ` — ${note}` : ''}`,
          authorId: 'external',
          authorName: requestedBy || 'I-MENTOR Case Management',
          authorRole: 'ADMIN',
        },
      },
    },
  })

  if (business.accountantId) {
    await prisma.notification.create({
      data: {
        accountantId: business.accountantId,
        type: 'CASE_UPDATE',
        title: `Νέα Ανάθεση #${clientCase.caseNumber}`,
        body: `Η I-MENTOR ζήτησε ανάθεση για τον πελάτη ${business.onomasia || business.afm}.`,
        link: `/cases/${clientCase.id}`,
      },
    }).catch(() => {})
  }

  notifyCaseManagement({
    caseNumber: clientCase.caseNumber,
    afm: business.afm,
    onomasia: business.onomasia,
    phone: business.phone || null,
    email: business.email || null,
    accountantOffice: business.accountant?.officeName || null,
    caseType: null,
    description: clientCase.description,
    priority: clientCase.priority,
    programTitle: programTitle || null,
    requestRef,
  }).catch(err => console.error('[CaseManagement] notify failed:', err?.message || err))

  return NextResponse.json({ id: clientCase.id, caseNumber: clientCase.caseNumber }, { status: 201 })
}
