import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import { buildQuestionnaireEmailHtml } from '@/lib/microcredits-business-plan'
import { notifyCaseManagementCommunication } from '@/lib/case-management-sync'

export const dynamic = 'force-dynamic'

const APP_URL = process.env.APP_URL || 'https://logistis.i-mentor.gr'

// Re-sends the exact same questionnaire link (same token, same questions) —
// for when the consultant wants to manually nudge a client rather than wait
// for the automatic 2-day reminder, or the client says they lost the email.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const isStaff = session.user.role === 'ADMIN' || session.user.role === 'CONSULTANT'
  if (!isStaff) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { programId } = await request.json().catch(() => ({}))
  if (typeof programId !== 'string' || !programId) {
    return NextResponse.json({ error: 'Λείπει το πρόγραμμα' }, { status: 400 })
  }

  const questionnaire = await prisma.microcreditsQuestionnaire.findFirst({
    where: { businessId: params.id, programId },
    orderBy: { createdAt: 'desc' },
    include: {
      business: { select: { afm: true, onomasia: true, email: true, phone: true } },
      program: { select: { title: true } },
    },
  })
  if (!questionnaire) return NextResponse.json({ error: 'Δεν βρέθηκε ερωτηματολόγιο' }, { status: 404 })
  if (!questionnaire.business.email) {
    return NextResponse.json({ error: 'Η επιχείρηση δεν έχει καταχωρημένο email' }, { status: 400 })
  }

  const appSetting = await prisma.appSetting.findUnique({ where: { id: 'main' } })
  const logoHtml = appSetting?.imentorLogoUrl
    ? `<img src="${appSetting.imentorLogoUrl}" alt="I-MENTOR" style="display:block;height:48px;width:auto;max-width:200px;object-fit:contain;margin:0 0 14px;" />`
    : `<span style="display:block;font-weight:800;letter-spacing:.5px;color:#ffffff;font-size:17px;margin:0 0 14px;">iMENTOR <span style="font-weight:400;opacity:.8;">CONSULTING</span></span>`

  const formUrl = `${APP_URL}/microcredits-questionnaire/${questionnaire.token}`
  const sent = await sendEmail({
    to: questionnaire.business.email,
    subject: `Ερωτηματολόγιο για την αίτησή σας στο Ταμείο Μικροπιστώσεων`,
    html: buildQuestionnaireEmailHtml({ businessName: questionnaire.business.onomasia || '', formUrl, logoHtml }),
  }).catch(() => false)

  if (!sent) return NextResponse.json({ error: 'Η αποστολή email απέτυχε' }, { status: 502 })

  const updated = await prisma.microcreditsQuestionnaire.update({
    where: { id: questionnaire.id },
    data: { lastReminderAt: new Date(), reminderCount: { increment: 1 } },
  })

  notifyCaseManagementCommunication({
    afm: questionnaire.business.afm,
    onomasia: questionnaire.business.onomasia,
    email: questionnaire.business.email,
    phone: questionnaire.business.phone,
    programTitle: questionnaire.program.title,
    kind: 'MICROCREDITS',
    channel: 'EMAIL',
    subject: `Ερωτηματολόγιο για την αίτησή σας στο Ταμείο Μικροπιστώσεων`,
    comment: 'Επαναστάλθηκε το ερωτηματολόγιο επιχειρηματικού σχεδίου Ταμείου Μικροπιστώσεων στον πελάτη.',
    leadStatus: 'ΑΝΑΜΟΝΗ ΑΠΑΝΤΗΣΗΣ ΕΡΩΤΗΜΑΤΟΛΟΓΙΟΥ',
    sentByName: session.user.name,
    sentByEmail: session.user.email,
  }).catch(() => {})

  return NextResponse.json({ questionnaire: updated })
}
