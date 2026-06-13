import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendEmail, renderCampaignEmailHtml } from '@/lib/email'

// Inbound API for I-MENTOR's εξωδικαστικός case-management application.
// Auth: header `x-api-key` must match env EXODIKASTIKOS_API_KEY.

function checkApiKey(request: NextRequest): boolean {
  const key = process.env.EXODIKASTIKOS_API_KEY
  return !!key && request.headers.get('x-api-key') === key
}

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED: 'Υποβλήθηκε', IN_ASSESSMENT: 'Σε Εκτίμηση', REPORT_READY: 'Έτοιμη Αναφορά',
  OFFER_SENT: 'Στάλθηκε Προσφορά', ACCEPTED: 'Αποδεκτό', DECLINED: 'Απορρίφθηκε', COMPLETED: 'Ολοκληρωμένο',
}
const VALID_STATUSES = Object.keys(STATUS_LABELS)

// PUT /api/external/exodikastikos — update status/result link by callbackRef (our case id) or caseNumber.
// Body: { callbackRef?: string, caseNumber?: number, status?, externalStatus?, externalRef?, resultLink?, note? }
export async function PUT(request: NextRequest) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { callbackRef, caseNumber, status, externalStatus, externalRef, resultLink, note } = await request.json()
  if (!callbackRef && !caseNumber) {
    return NextResponse.json({ error: 'callbackRef or caseNumber is required' }, { status: 400 })
  }
  if (status && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: `Invalid status. Valid: ${VALID_STATUSES.join(', ')}` }, { status: 400 })
  }

  const existing = callbackRef
    ? await prisma.exodikastikosCase.findUnique({
        where: { id: callbackRef },
        include: { accountant: { select: { id: true, officeName: true, email: true, contactPerson: true, logoUrl: true } }, business: { select: { onomasia: true, afm: true } } },
      })
    : await prisma.exodikastikosCase.findUnique({
        where: { caseNumber: Number(caseNumber) },
        include: { accountant: { select: { id: true, officeName: true, email: true, contactPerson: true, logoUrl: true } }, business: { select: { onomasia: true, afm: true } } },
      })
  if (!existing) return NextResponse.json({ error: 'Case not found' }, { status: 404 })

  const data: any = { externalSyncedAt: new Date() }
  const notes: string[] = []

  if (status && status !== existing.status) {
    data.status = status
    notes.push(`Η κατάσταση άλλαξε σε «${STATUS_LABELS[status] || status}»`)
  }
  if (externalStatus !== undefined && externalStatus !== existing.externalStatus) {
    data.externalStatus = externalStatus || null
  }
  if (externalRef && !existing.externalRef) data.externalRef = String(externalRef)
  if (resultLink !== undefined && resultLink !== existing.resultLink) {
    data.resultLink = resultLink || null
    if (resultLink) notes.push('Προστέθηκε σύνδεσμος με την εκτίμηση αποτελέσματος')
  }
  if (note) notes.push(note)

  const updated = await prisma.exodikastikosCase.update({
    where: { id: existing.id },
    data: {
      ...data,
      activities: notes.length ? {
        create: { type: 'EXTERNAL', body: notes.join(' | '), authorId: 'external', authorName: 'I-MENTOR Εξωδικαστικός' },
      } : undefined,
    },
  })

  if (notes.length && existing.accountantId && existing.accountant) {
    try {
      await prisma.notification.create({
        data: {
          accountantId: existing.accountantId,
          type: 'EXODIKASTIKOS_UPDATE',
          title: `Ενημέρωση Εξωδικαστικού #${existing.caseNumber}`,
          body: notes.join(' | '),
          link: `/exodikastikos/${existing.id}`,
        },
      })
      if (existing.accountant.email) {
        const appSetting = await prisma.appSetting.findUnique({ where: { id: 'main' } })
        await sendEmail({
          to: existing.accountant.email,
          subject: `Ενημέρωση Εξωδικαστικού #${existing.caseNumber}`,
          html: renderCampaignEmailHtml({
            title: `Ενημέρωση Εξωδικαστικού #${existing.caseNumber}`,
            recipientName: existing.accountant.contactPerson || existing.accountant.officeName,
            bodyText: `Η υπόθεση εξωδικαστικού #${existing.caseNumber} (${existing.business.onomasia || existing.business.afm}) ενημερώθηκε:\n\n${notes.map(n => `• ${n}`).join('\n')}\n\nΔείτε την υπόθεση: ${process.env.APP_URL || 'https://logistis.i-mentor.gr'}/exodikastikos/${existing.id}`,
            imentorLogoUrl: appSetting?.imentorLogoUrl || '',
            accountantOfficeName: existing.accountant.officeName,
            accountantLogoUrl: existing.accountant.logoUrl || undefined,
          }),
        })
      }
    } catch {}
  }

  return NextResponse.json({ id: updated.id, caseNumber: updated.caseNumber, status: updated.status, resultLink: updated.resultLink })
}

// GET /api/external/exodikastikos?callbackRef=... or ?caseNumber=... — read back case state.
export async function GET(request: NextRequest) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const callbackRef = request.nextUrl.searchParams.get('callbackRef')
  const caseNumber = request.nextUrl.searchParams.get('caseNumber')
  if (!callbackRef && !caseNumber) {
    return NextResponse.json({ error: 'callbackRef or caseNumber is required' }, { status: 400 })
  }

  const item = callbackRef
    ? await prisma.exodikastikosCase.findUnique({ where: { id: callbackRef }, include: { business: { select: { afm: true, onomasia: true } } } })
    : await prisma.exodikastikosCase.findUnique({ where: { caseNumber: Number(caseNumber) }, include: { business: { select: { afm: true, onomasia: true } } } })
  if (!item) return NextResponse.json({ error: 'Case not found' }, { status: 404 })

  return NextResponse.json({
    id: item.id,
    caseNumber: item.caseNumber,
    status: item.status,
    externalRef: item.externalRef,
    externalStatus: item.externalStatus,
    resultLink: item.resultLink,
    business: item.business,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  })
}
