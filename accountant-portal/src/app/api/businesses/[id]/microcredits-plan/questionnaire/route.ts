import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateMicrocreditsQuestionnaire } from '@/lib/microcredits-business-plan'
import { sendEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

const APP_URL = process.env.APP_URL || 'https://logistis.i-mentor.gr'

// ΤΑΜΕΙΟ ΜΙΚΡΟΠΙΣΤΩΣΕΩΝ business-plan flow, step 1: the consultant picks
// which of the business's own ΚΑΔ the application is actually about (a
// business can match the program on multiple ΚΑΔ, but the questionnaire —
// and later the business plan's own "ΚΑΔ Επένδυσης" field — must be
// tailored to only the one(s) that genuinely apply), optionally overriding
// the official ΚΑΔ description with a short note when it doesn't match
// reality. An AI-tailored questionnaire is generated and emailed to the
// client via a public token link.
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const programId = request.nextUrl.searchParams.get('programId')
  if (!programId) return NextResponse.json({ error: 'Λείπει το πρόγραμμα' }, { status: 400 })

  const questionnaire = await prisma.microcreditsQuestionnaire.findFirst({
    where: { businessId: params.id, programId },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ questionnaire })
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const isStaff = session.user.role === 'ADMIN' || session.user.role === 'CONSULTANT'
  if (!isStaff) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { programId, selectedKadCodes, activityNote } = await request.json().catch(() => ({}))
  if (typeof programId !== 'string' || !programId) {
    return NextResponse.json({ error: 'Λείπει το πρόγραμμα' }, { status: 400 })
  }
  if (!Array.isArray(selectedKadCodes) || selectedKadCodes.length === 0) {
    return NextResponse.json({ error: 'Επιλέξτε τουλάχιστον έναν ΚΑΔ' }, { status: 400 })
  }

  const business = await prisma.business.findUnique({
    where: { id: params.id },
    include: { activities: true },
  })
  if (!business) return NextResponse.json({ error: 'Δεν βρέθηκε η επιχείρηση' }, { status: 404 })
  if (!business.email) return NextResponse.json({ error: 'Η επιχείρηση δεν έχει καταχωρημένο email' }, { status: 400 })

  const program = await prisma.program.findUnique({ where: { id: programId } })
  if (!program || program.category !== 'MICROCREDITS') {
    return NextResponse.json({ error: 'Μη έγκυρο πρόγραμμα — αναμένεται το Ταμείο Μικροπιστώσεων' }, { status: 400 })
  }

  const selectedKad = business.activities
    .filter(a => selectedKadCodes.includes(a.firmActCode))
    .map(a => ({ code: a.firmActCode, description: a.firmActDescr || '' }))
  if (selectedKad.length === 0) {
    return NextResponse.json({ error: 'Οι επιλεγμένοι ΚΑΔ δεν βρέθηκαν στις δραστηριότητες της επιχείρησης' }, { status: 400 })
  }

  let questions
  try {
    questions = await generateMicrocreditsQuestionnaire({
      businessName: business.onomasia || business.afm,
      selectedKad,
      activityNote: activityNote || null,
    })
  } catch (err: any) {
    console.error('[Microcredits questionnaire] AI generation failed:', err?.message)
    return NextResponse.json({ error: 'Η δημιουργία του ερωτηματολογίου απέτυχε.' }, { status: 500 })
  }

  const questionnaire = await prisma.microcreditsQuestionnaire.create({
    data: {
      businessId: business.id,
      programId,
      selectedKadCodes,
      activityNote: activityNote || null,
      questions: questions as any,
      sentAt: new Date(),
    },
  })

  const formUrl = `${APP_URL}/microcredits-questionnaire/${questionnaire.token}`
  const sent = await sendEmail({
    to: business.email,
    subject: `Ερωτηματολόγιο για την αίτησή σας στο Ταμείο Μικροπιστώσεων`,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#374151;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius:12px 12px 0 0;overflow:hidden;">
      <tr><td bgcolor="#1e3a8a" style="background:linear-gradient(135deg,#1e3a8a,#1e40af);padding:24px 28px;">
        <h1 style="color:#ffffff;margin:0;font-size:19px;">📋 Ερωτηματολόγιο Επιχειρηματικού Σχεδίου</h1>
      </td></tr>
      </table>
      <div style="background:#ffffff;padding:26px 28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
        <p style="margin:0 0 16px;font-size:15px;">Αγαπητέ/ή <strong>${business.onomasia || ''}</strong>,</p>
        <p style="margin:0 0 20px;font-size:14px;line-height:1.7;">
          Για να προχωρήσουμε με την αίτησή σας στο <strong>Ταμείο Μικροπιστώσεων (ΤΕΠΙΧ ΙΙΙ)</strong>, χρειαζόμαστε λίγες ακόμη πληροφορίες για την επιχείρησή σας. Παρακαλούμε συμπληρώστε το σύντομο ερωτηματολόγιο στον παρακάτω σύνδεσμο — θα σας πάρει περίπου 10-15 λεπτά.
        </p>
        <div style="text-align:center;margin:0 0 20px;">
          <a href="${formUrl}" style="display:inline-block;background:#1e3a8a;color:white;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:15px;">Συμπλήρωση Ερωτηματολογίου →</a>
        </div>
        <p style="margin:0;font-size:13px;color:#6b7280;">Για οποιαδήποτε απορία, επικοινωνήστε μαζί μας.</p>
      </div>
    </div>`,
  }).catch(() => false)

  if (!sent) {
    return NextResponse.json({ error: 'Το ερωτηματολόγιο δημιουργήθηκε αλλά η αποστολή email απέτυχε.', questionnaire }, { status: 502 })
  }

  return NextResponse.json({ questionnaire })
}
