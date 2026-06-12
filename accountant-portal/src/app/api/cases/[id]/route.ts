import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { sendEmail } from '@/lib/email'

const STATUS_LABELS: Record<string, string> = {
  NEW: 'Νέο', ACCEPTED: 'Αποδεκτό', IN_PROGRESS: 'Σε Εξέλιξη',
  WAITING_CLIENT: 'Αναμονή Πελάτη', WAITING_ACCOUNTANT: 'Αναμονή Λογιστή',
  COMPLETED: 'Ολοκληρωμένο', CANCELLED: 'Ακυρωμένο',
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const clientCase = await prisma.clientCase.findUnique({
    where: { id: params.id },
    include: {
      accountant: { select: { id: true, officeName: true, contactPerson: true, email: true } },
      business: { select: { id: true, afm: true, onomasia: true } },
      program: { select: { id: true, title: true } },
      activities: { orderBy: { createdAt: 'asc' } },
    },
  })

  if (!clientCase) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isAdmin = session.user.role === 'ADMIN'
  if (!isAdmin && clientCase.accountantId !== session.user.accountantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!isAdmin) {
    clientCase.activities = clientCase.activities.filter(a => !a.internal)
  }

  let assignees: { id: string; name: string }[] = []
  if (isAdmin) {
    assignees = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
  }

  return NextResponse.json({ case: clientCase, assignees })
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await prisma.clientCase.findUnique({
    where: { id: params.id },
    include: { accountant: { select: { officeName: true, email: true } }, business: { select: { onomasia: true, afm: true } } },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isAdmin = session.user.role === 'ADMIN'
  const body = await request.json()

  const data: any = {}
  const activityNotes: { type: string; body: string }[] = []

  if (isAdmin) {
    if (body.status && body.status !== existing.status) {
      data.status = body.status
      activityNotes.push({ type: 'STATUS_CHANGE', body: `Η κατάσταση άλλαξε σε «${STATUS_LABELS[body.status] || body.status}»` })
    }
    if ('assignedToId' in body && body.assignedToId !== existing.assignedToId) {
      data.assignedToId = body.assignedToId || null
      if (body.assignedToId) {
        const user = await prisma.user.findUnique({ where: { id: body.assignedToId }, select: { name: true } })
        activityNotes.push({ type: 'ASSIGNMENT', body: `Η υπόθεση ανατέθηκε στον/στην ${user?.name || ''}` })
      } else {
        activityNotes.push({ type: 'ASSIGNMENT', body: 'Η ανάθεση αφαιρέθηκε' })
      }
    }
    if ('priority' in body && body.priority !== existing.priority) {
      data.priority = body.priority
      activityNotes.push({ type: 'NOTE', body: `Η προτεραιότητα άλλαξε σε «${body.priority}»` })
    }
    if ('dueDate' in body) {
      data.dueDate = body.dueDate ? new Date(body.dueDate) : null
    }
    if ('outcome' in body) {
      data.outcome = body.outcome || null
    }
  } else {
    // Accountant can only cancel while NEW
    if (body.status === 'CANCELLED' && existing.status === 'NEW') {
      data.status = 'CANCELLED'
      activityNotes.push({ type: 'STATUS_CHANGE', body: 'Η υπόθεση ακυρώθηκε από τον λογιστή' })
    } else if (Object.keys(body).length) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  if (Object.keys(data).length === 0 && activityNotes.length === 0) {
    return NextResponse.json(existing)
  }

  const updated = await prisma.clientCase.update({
    where: { id: params.id },
    data: {
      ...data,
      activities: {
        create: activityNotes.map(a => ({
          type: a.type,
          body: a.body,
          authorId: session.user.id,
          authorName: session.user.name || '',
          authorRole: session.user.role,
        })),
      },
    },
    include: {
      accountant: { select: { id: true, officeName: true, email: true } },
      business: { select: { id: true, afm: true, onomasia: true } },
      program: { select: { id: true, title: true } },
      activities: { orderBy: { createdAt: 'asc' } },
    },
  })

  await createAuditLog({
    userId: session.user.id,
    action: 'UPDATE',
    entity: 'ClientCase',
    entityId: updated.id,
    details: `Υπόθεση #${updated.caseNumber} — ${activityNotes.map(a => a.body).join(' | ')}`,
  })

  // Notify accountant only if admin explicitly opted in
  if (isAdmin && body.notifyAccountant && activityNotes.length) {
    try {
      await prisma.notification.create({
        data: {
          accountantId: existing.accountantId,
          type: 'CASE_UPDATE',
          title: `Ενημέρωση Υπόθεσης #${existing.caseNumber}`,
          body: activityNotes.map(a => a.body).join(' | '),
          link: `/cases/${existing.id}`,
        },
      })
      if (existing.accountant.email) {
        await sendEmail({
          to: existing.accountant.email,
          subject: `🗂️ Ενημέρωση Υπόθεσης #${existing.caseNumber}`,
          html: `<p>Η υπόθεση <strong>#${existing.caseNumber}</strong> (${existing.business.onomasia || existing.business.afm}) ενημερώθηκε:</p>
            <blockquote style="border-left:4px solid #4f46e5;padding-left:12px;color:#374151">${activityNotes.map(a => a.body).join('<br/>')}</blockquote>
            <p><a href="${process.env.APP_URL || 'https://logistis.i-mentor.gr'}/cases/${existing.id}">Δείτε την υπόθεση →</a></p>`,
        })
      }
    } catch {}
  }

  if (!isAdmin) {
    updated.activities = updated.activities.filter(a => !a.internal)
  }

  return NextResponse.json(updated)
}
