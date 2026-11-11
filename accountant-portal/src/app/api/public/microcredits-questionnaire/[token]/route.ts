import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

const APP_URL = process.env.APP_URL || 'https://logistis.i-mentor.gr'

export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  const questionnaire = await prisma.microcreditsQuestionnaire.findUnique({
    where: { token: params.token },
    include: { business: { select: { onomasia: true } } },
  })
  if (!questionnaire) return NextResponse.json({ error: 'Ο σύνδεσμος δεν είναι έγκυρος.' }, { status: 404 })

  return NextResponse.json({
    businessName: questionnaire.business.onomasia,
    questions: questionnaire.questions,
    answers: questionnaire.answers || {},
    respondedAt: questionnaire.respondedAt,
  })
}

// `submit: true` (the final "Υποβολή" click) marks the questionnaire as
// answered (respondedAt). Without it, this is just an autosave of
// in-progress answers — called periodically while the client types, so
// closing the tab and coming back later doesn't lose their progress —
// and must NOT mark the questionnaire as responded.
export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  const questionnaire = await prisma.microcreditsQuestionnaire.findUnique({
    where: { token: params.token },
    include: { business: { select: { onomasia: true, afm: true, phone: true, email: true } }, program: { select: { title: true } } },
  })
  if (!questionnaire) return NextResponse.json({ error: 'Ο σύνδεσμος δεν είναι έγκυρος.' }, { status: 404 })

  const { answers, submit } = await request.json().catch(() => ({}))
  if (!answers || typeof answers !== 'object') {
    return NextResponse.json({ error: 'Λείπουν οι απαντήσεις' }, { status: 400 })
  }

  const isFirstSubmission = submit === true && !questionnaire.respondedAt

  await prisma.microcreditsQuestionnaire.update({
    where: { id: questionnaire.id },
    data: submit === true ? { answers, respondedAt: new Date() } : { answers },
  })

  // Notify the office as soon as the client submits for the first time, so
  // a consultant picks it up and moves straight to generating/signing the
  // business plan — don't re-notify on every subsequent edit+resubmit.
  if (isFirstSubmission) {
    const business = questionnaire.business
    const businessUrl = `${APP_URL}/businesses/${questionnaire.businessId}`
    sendEmail({
      to: 'info@i-mentor.gr',
      subject: `✅ Απαντήθηκε ερωτηματολόγιο Μικροπιστώσεων — ${business.onomasia || business.afm}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#374151;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius:12px 12px 0 0;overflow:hidden;">
        <tr><td bgcolor="#059669" style="background:linear-gradient(135deg,#059669,#047857);padding:22px 26px;">
          <h1 style="color:#ffffff;margin:0;font-size:18px;">✅ Ο πελάτης απάντησε το ερωτηματολόγιο</h1>
        </td></tr>
        </table>
        <div style="background:#ffffff;padding:24px 26px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
          <p style="margin:0 0 14px;font-size:14px;line-height:1.7;">
            Η επιχείρηση <strong>${business.onomasia || '—'}</strong> (ΑΦΜ: ${business.afm}) απάντησε το ερωτηματολόγιο για το πρόγραμμα <strong>${questionnaire.program.title}</strong>. Μπορείτε να προχωρήσετε στη δημιουργία του Business Plan προς υπογραφή.
          </p>
          <table style="width:100%;border-collapse:collapse;font-size:13px;margin:0 0 20px;">
            ${business.phone ? `<tr><td style="padding:4px 0;color:#6b7280;">Τηλέφωνο:</td><td style="padding:4px 0;color:#111827;">${business.phone}</td></tr>` : ''}
            ${business.email ? `<tr><td style="padding:4px 0;color:#6b7280;">Email:</td><td style="padding:4px 0;color:#111827;">${business.email}</td></tr>` : ''}
          </table>
          <div style="text-align:center;">
            <a href="${businessUrl}" style="display:inline-block;background:#059669;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;">Μετάβαση στην Επιχείρηση →</a>
          </div>
        </div>
      </div>`,
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}
