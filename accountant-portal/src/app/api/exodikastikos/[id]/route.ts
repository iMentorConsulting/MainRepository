import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { sendEmail, renderCampaignEmailHtml } from '@/lib/email'

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED: 'Υποβλήθηκε', IN_ASSESSMENT: 'Σε Εκτίμηση', REPORT_READY: 'Έτοιμη Αναφορά',
  OFFER_SENT: 'Στάλθηκε Προσφορά', ACCEPTED: 'Αποδεκτό', DECLINED: 'Απορρίφθηκε', COMPLETED: 'Ολοκληρωμένο',
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const item = await prisma.exodikastikosCase.findUnique({
    where: { id: params.id },
    include: {
      accountant: { select: { id: true, officeName: true, contactPerson: true, email: true } },
      business: { select: { id: true, afm: true, onomasia: true, clientType: true, email: true, phone: true } },
      activities: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isAdmin = session.user.role === 'ADMIN'
  if (!isAdmin && item.accountantId !== session.user.accountantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Never expose credential ciphertext/plaintext to the client.
  const { taxisnetUsernameEnc, taxisnetPasswordEnc, spouseTaxisnetUsernameEnc, spouseTaxisnetPasswordEnc, ...safe } = item as any
  return NextResponse.json({
    ...safe,
    hasTaxisnetCredentials: !!taxisnetUsernameEnc,
    hasSpouseTaxisnetCredentials: !!spouseTaxisnetUsernameEnc,
  })
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await prisma.exodikastikosCase.findUnique({
    where: { id: params.id },
    include: { accountant: { select: { officeName: true, email: true } }, business: { select: { onomasia: true, afm: true } } },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isAdmin = session.user.role === 'ADMIN'
  if (!isAdmin && existing.accountantId !== session.user.accountantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const data: any = {}
  const activityNotes: { type: string; body: string }[] = []

  if (isAdmin) {
    if (body.status && body.status !== existing.status) {
      data.status = body.status
      activityNotes.push({ type: 'STATUS_CHANGE', body: `Η κατάσταση άλλαξε σε «${STATUS_LABELS[body.status] || body.status}»` })
    }
    if ('resultLink' in body && body.resultLink !== existing.resultLink) {
      data.resultLink = body.resultLink || null
      if (body.resultLink) activityNotes.push({ type: 'RESULT', body: 'Προστέθηκε σύνδεσμος με την εκτίμηση αποτελέσματος' })
    }
    if ('externalRef' in body) data.externalRef = body.externalRef || null
  } else if (Object.keys(body).length) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if ('notes' in body && (isAdmin || existing.accountantId === session.user.accountantId)) {
    data.notes = body.notes || null
  }

  if (Object.keys(data).length === 0 && activityNotes.length === 0) {
    return NextResponse.json(existing)
  }

  const updated = await prisma.exodikastikosCase.update({
    where: { id: params.id },
    data: {
      ...data,
      activities: activityNotes.length ? {
        create: activityNotes.map(a => ({
          type: a.type, body: a.body, authorId: session.user.id, authorName: session.user.name || '',
        })),
      } : undefined,
    },
    include: {
      accountant: { select: { id: true, officeName: true, email: true } },
      business: { select: { id: true, afm: true, onomasia: true } },
      activities: { orderBy: { createdAt: 'asc' } },
    },
  })

  await createAuditLog({
    userId: session.user.id,
    action: 'UPDATE',
    entity: 'ExodikastikosCase',
    entityId: updated.id,
    details: `Υπόθεση Εξωδικαστικού #${updated.caseNumber} — ${activityNotes.map(a => a.body).join(' | ') || 'σημειώσεις'}`,
  })

  if (isAdmin && activityNotes.length && existing.accountantId) {
    try {
      await prisma.notification.create({
        data: {
          accountantId: existing.accountantId,
          type: 'EXODIKASTIKOS_UPDATE',
          title: `Ενημέρωση Εξωδικαστικού #${existing.caseNumber}`,
          body: activityNotes.map(a => a.body).join(' | '),
          link: `/exodikastikos/${existing.id}`,
        },
      })
      if (existing.accountant?.email) {
        const appSetting = await prisma.appSetting.findUnique({ where: { id: 'main' } })
        const accountant = await prisma.accountant.findUnique({ where: { id: existing.accountantId }, select: { officeName: true, logoUrl: true, contactPerson: true } })
        await sendEmail({
          to: existing.accountant.email,
          subject: `Ενημέρωση Εξωδικαστικού #${existing.caseNumber}`,
          html: renderCampaignEmailHtml({
            title: `Ενημέρωση Εξωδικαστικού #${existing.caseNumber}`,
            recipientName: accountant?.contactPerson || existing.accountant.officeName,
            bodyText: `Η υπόθεση εξωδικαστικού #${existing.caseNumber} (${existing.business.onomasia || existing.business.afm}) ενημερώθηκε:\n\n${activityNotes.map(a => `• ${a.body}`).join('\n')}\n\nΔείτε την υπόθεση: ${process.env.APP_URL || 'https://logistis.i-mentor.gr'}/exodikastikos/${existing.id}`,
            imentorLogoUrl: appSetting?.imentorLogoUrl || '',
            accountantOfficeName: accountant?.officeName,
            accountantLogoUrl: accountant?.logoUrl || undefined,
          }),
        })
      }
    } catch {}
  }

  const { taxisnetUsernameEnc, taxisnetPasswordEnc, spouseTaxisnetUsernameEnc, spouseTaxisnetPasswordEnc, ...safe } = updated as any
  return NextResponse.json(safe)
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const existing = await prisma.exodikastikosCase.findUnique({ where: { id: params.id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.exodikastikosCase.delete({ where: { id: params.id } })

  await createAuditLog({
    userId: session.user.id,
    action: 'DELETE',
    entity: 'ExodikastikosCase',
    entityId: existing.id,
    details: `Διαγραφή υπόθεσης εξωδικαστικού #${existing.caseNumber}`,
  })

  return NextResponse.json({ success: true })
}
