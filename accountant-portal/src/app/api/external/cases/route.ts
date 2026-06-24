import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Inbound API for the inhouse case-management system.
// Auth: header `x-api-key` must match env CASES_API_KEY.

function checkApiKey(request: NextRequest): boolean {
  const key = process.env.CASES_API_KEY
  return !!key && request.headers.get('x-api-key') === key
}

const VALID_STATUSES = ['NEW', 'ACCEPTED', 'IN_PROGRESS', 'WAITING_CLIENT', 'WAITING_ACCOUNTANT', 'COMPLETED', 'CANCELLED']

// POST /api/external/cases — open (or link) a case when the client pays in the inhouse system.
// Body: { afm: string, externalRef: string, status?, externalStatus?, note?, caseType?, dueDate?, requestRef? }
// `requestRef` is echoed back from a prior POST /api/assignment-requests call (see
// lib/case-management-sync.ts) — when present, it's used to mark that AssignmentRequest as matched.
export async function POST(request: NextRequest) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { afm, externalRef, status, externalStatus, note, caseType, dueDate, requestRef } = await request.json()
  if (!afm || !externalRef) {
    return NextResponse.json({ error: 'afm and externalRef are required' }, { status: 400 })
  }
  if (status && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: `Invalid status. Valid: ${VALID_STATUSES.join(', ')}` }, { status: 400 })
  }

  const business = await prisma.business.findUnique({
    where: { afm: String(afm) },
    select: { id: true, accountantId: true, onomasia: true, afm: true },
  })
  if (!business) return NextResponse.json({ error: 'Business not found for this AFM' }, { status: 404 })

  // Idempotent: if a case with this externalRef already exists, update it instead
  const existing = await prisma.clientCase.findUnique({ where: { externalRef } })
  if (existing) {
    const updated = await applyExternalUpdate(existing.id, { status, externalStatus, note, dueDate })
    await linkAssignmentRequest(requestRef, updated.id)
    return NextResponse.json({ id: updated.id, caseNumber: updated.caseNumber, created: false })
  }

  // Link to the most recent unlinked case for this business (created by the portal, awaiting external ref)
  const unlinked = await prisma.clientCase.findFirst({
    where: { businessId: business.id, externalRef: null },
    orderBy: { createdAt: 'desc' },
  })
  if (unlinked) {
    const updated = await applyExternalUpdate(unlinked.id, { status, externalStatus, note, dueDate, externalRef })
    await linkAssignmentRequest(requestRef, updated.id)
    return NextResponse.json({ id: updated.id, caseNumber: updated.caseNumber, created: false })
  }

  const clientCase = await prisma.clientCase.create({
    data: {
      accountantId: business.accountantId,
      businessId: business.id,
      requestType: 'OTHER',
      caseType: caseType || 'Ανάληψη Πελάτη',
      title: business.onomasia || business.afm,
      description: note || null,
      status: status || 'ACCEPTED',
      externalRef,
      externalStatus: externalStatus || null,
      externalSyncedAt: new Date(),
      dueDate: dueDate ? new Date(dueDate) : null,
      createdById: 'external',
      activities: {
        create: {
          type: 'EXTERNAL',
          body: `Η υπόθεση δημιουργήθηκε αυτόματα από το Case Management της I-MENTOR (ref: ${externalRef})${note ? ` — ${note}` : ''}`,
          authorId: 'external',
          authorName: 'I-MENTOR Case Management',
          authorRole: 'ADMIN',
        },
      },
    },
  })

  await linkAssignmentRequest(requestRef, clientCase.id)

  return NextResponse.json({ id: clientCase.id, caseNumber: clientCase.caseNumber, created: true }, { status: 201 })
}

async function linkAssignmentRequest(requestRef: string | undefined | null, caseId: string) {
  if (!requestRef) return
  await prisma.assignmentRequest.update({
    where: { id: requestRef },
    data: { status: 'MATCHED', caseId, matchedAt: new Date() },
  }).catch(() => {})
}

// PUT /api/external/cases — update an existing case by externalRef or caseNumber.
// Body: { externalRef?: string, caseNumber?: number, status?, externalStatus?, note?, dueDate?, outcome?, resultLink? }
export async function PUT(request: NextRequest) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { externalRef, caseNumber, status, externalStatus, note, dueDate, outcome, resultLink } = await request.json()
  if (!externalRef && !caseNumber) {
    return NextResponse.json({ error: 'externalRef or caseNumber is required' }, { status: 400 })
  }
  if (status && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: `Invalid status. Valid: ${VALID_STATUSES.join(', ')}` }, { status: 400 })
  }

  const existing = externalRef
    ? await prisma.clientCase.findUnique({ where: { externalRef } })
    : await prisma.clientCase.findUnique({ where: { caseNumber: Number(caseNumber) } })
  if (!existing) return NextResponse.json({ error: 'Case not found' }, { status: 404 })

  const updated = await applyExternalUpdate(existing.id, { status, externalStatus, note, dueDate, outcome, resultLink, externalRef })
  return NextResponse.json({ id: updated.id, caseNumber: updated.caseNumber, status: updated.status, resultLink: updated.resultLink })
}

// GET /api/external/cases?externalRef=... or ?caseNumber=... — read back case state.
export async function GET(request: NextRequest) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const externalRef = request.nextUrl.searchParams.get('externalRef')
  const caseNumber = request.nextUrl.searchParams.get('caseNumber')
  if (!externalRef && !caseNumber) {
    return NextResponse.json({ error: 'externalRef or caseNumber is required' }, { status: 400 })
  }

  const clientCase = externalRef
    ? await prisma.clientCase.findUnique({ where: { externalRef }, include: { business: { select: { afm: true, onomasia: true } } } })
    : await prisma.clientCase.findUnique({ where: { caseNumber: Number(caseNumber) }, include: { business: { select: { afm: true, onomasia: true } } } })
  if (!clientCase) return NextResponse.json({ error: 'Case not found' }, { status: 404 })

  return NextResponse.json({
    id: clientCase.id,
    caseNumber: clientCase.caseNumber,
    status: clientCase.status,
    externalRef: clientCase.externalRef,
    externalStatus: clientCase.externalStatus,
    externalSyncedAt: clientCase.externalSyncedAt,
    resultLink: clientCase.resultLink,
    dueDate: clientCase.dueDate,
    outcome: clientCase.outcome,
    business: clientCase.business,
    createdAt: clientCase.createdAt,
    updatedAt: clientCase.updatedAt,
  })
}

const STATUS_LABELS: Record<string, string> = {
  NEW: 'Νέο', ACCEPTED: 'Αποδεκτό', IN_PROGRESS: 'Σε Εξέλιξη',
  WAITING_CLIENT: 'Αναμονή Πελάτη', WAITING_ACCOUNTANT: 'Αναμονή Λογιστή',
  COMPLETED: 'Ολοκληρωμένο', CANCELLED: 'Ακυρωμένο',
}

async function applyExternalUpdate(caseId: string, patch: {
  status?: string; externalStatus?: string; note?: string; dueDate?: string; outcome?: string; resultLink?: string; externalRef?: string
}) {
  const existing = await prisma.clientCase.findUniqueOrThrow({ where: { id: caseId } })
  const data: any = { externalSyncedAt: new Date() }
  const notes: string[] = []

  if (patch.status && patch.status !== existing.status) {
    data.status = patch.status
    notes.push(`Η κατάσταση άλλαξε σε «${STATUS_LABELS[patch.status] || patch.status}»`)
  }
  if (patch.externalStatus !== undefined && patch.externalStatus !== existing.externalStatus) {
    data.externalStatus = patch.externalStatus || null
    if (patch.externalStatus) notes.push(`Κατάσταση Case Management: ${patch.externalStatus}`)
  }
  if (patch.externalRef && !existing.externalRef) data.externalRef = patch.externalRef
  if (patch.dueDate !== undefined) data.dueDate = patch.dueDate ? new Date(patch.dueDate) : null
  if (patch.outcome !== undefined) data.outcome = patch.outcome || null
  if (patch.resultLink !== undefined && patch.resultLink !== existing.resultLink) {
    data.resultLink = patch.resultLink || null
    if (patch.resultLink) notes.push('Προστέθηκε σύνδεσμος με την υπόθεση στο Case Management')
  }
  if (patch.note) notes.push(patch.note)

  return prisma.clientCase.update({
    where: { id: caseId },
    data: {
      ...data,
      activities: notes.length ? {
        create: {
          type: 'EXTERNAL',
          body: notes.join(' | '),
          authorId: 'external',
          authorName: 'I-MENTOR Case Management',
          authorRole: 'ADMIN',
        },
      } : undefined,
    },
  })
}
