import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { notifyCaseManagementDocument } from '@/lib/case-management-sync'

// Inbound API for the inhouse case-management system.
// Auth: header `x-api-key` must match env CASES_API_KEY.

function checkApiKey(request: NextRequest): boolean {
  const key = process.env.CASES_API_KEY
  return !!key && request.headers.get('x-api-key') === key
}

const VALID_STATUSES = ['NEW', 'ACCEPTED', 'IN_PROGRESS', 'WAITING_CLIENT', 'WAITING_ACCOUNTANT', 'COMPLETED', 'CANCELLED']

// POST /api/external/cases — open (or link) a case when the client pays in the inhouse system.
// Body: { afm: string, externalRef: string, status?, externalStatus?, note?, caseType?, dueDate? }
export async function POST(request: NextRequest) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { afm, externalRef, status, externalStatus, note, caseType, dueDate } = await request.json()
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
    return NextResponse.json({ id: updated.id, caseNumber: updated.caseNumber, created: false })
  }

  // 1. Link to the most recent unlinked case for this business (created by the portal, awaiting external ref)
  const unlinked = await prisma.clientCase.findFirst({
    where: { businessId: business.id, externalRef: null },
    orderBy: { createdAt: 'desc' },
  })
  if (unlinked) {
    const updated = await applyExternalUpdate(unlinked.id, { status, externalStatus, note, dueDate, externalRef })
    return NextResponse.json({ id: updated.id, caseNumber: updated.caseNumber, created: false })
  }

  // 2. Fallback: link to the most recent case for this business created in the last 48 hours,
  //    even if it already has a different externalRef (CM sends a second ref on acceptance).
  //    This prevents a duplicate generic "Ανάληψη Πελάτη" case from being created when
  //    the CM sends a follow-up call after the original Ermis case already received its ref.
  const recentCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000)
  const recent = await prisma.clientCase.findFirst({
    where: {
      businessId: business.id,
      createdAt: { gte: recentCutoff },
      status: { notIn: ['COMPLETED', 'CANCELLED'] },
    },
    orderBy: { createdAt: 'desc' },
  })
  if (recent) {
    const updated = await applyExternalUpdate(recent.id, { status, externalStatus, note, dueDate, externalRef: recent.externalRef ? undefined : externalRef })
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

  return NextResponse.json({ id: clientCase.id, caseNumber: clientCase.caseNumber, created: true }, { status: 201 })
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
  const justLinked = !!(patch.externalRef && !existing.externalRef)
  if (justLinked) data.externalRef = patch.externalRef
  if (patch.dueDate !== undefined) data.dueDate = patch.dueDate ? new Date(patch.dueDate) : null
  if (patch.outcome !== undefined) data.outcome = patch.outcome || null
  if (patch.resultLink !== undefined && patch.resultLink !== existing.resultLink) {
    data.resultLink = patch.resultLink || null
    if (patch.resultLink) notes.push('Προστέθηκε σύνδεσμος με την υπόθεση στο Case Management')
  }
  if (patch.note) notes.push(patch.note)

  const updated = await prisma.clientCase.update({
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

  // The case just got its externalRef for the first time (Case Management
  // linked/accepted it). Any document uploaded earlier — e.g. right after
  // the accountant created the assignment, before acceptance — had nothing
  // to attach to and was left unsynced. Flush those now.
  if (justLinked) {
    flushUnsyncedDocuments(updated.id, updated.caseNumber, updated.externalRef!).catch(() => {})
  }

  return updated
}

async function flushUnsyncedDocuments(caseId: string, caseNumber: number, externalRef: string) {
  const [docs, business] = await Promise.all([
    prisma.caseDocument.findMany({ where: { caseId, syncedToCaseManagement: false } }),
    prisma.clientCase.findUnique({ where: { id: caseId } }).then(c => c && prisma.business.findUnique({ where: { id: c.businessId }, select: { afm: true, onomasia: true } })),
  ])
  if (!business) return

  for (const doc of docs) {
    const synced = await notifyCaseManagementDocument({
      caseNumber,
      externalRef,
      afm: business.afm,
      onomasia: business.onomasia,
      category: doc.category,
      fileName: doc.fileName,
      dataUrl: doc.dataUrl,
      uploadedByName: doc.uploadedByName,
      uploadedByRole: doc.uploadedByRole,
    })
    if (synced) {
      await prisma.caseDocument.update({ where: { id: doc.id }, data: { syncedToCaseManagement: true } }).catch(() => {})
    }
  }
}
