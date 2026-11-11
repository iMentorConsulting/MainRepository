import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { sendEmail } from '@/lib/email'

export const runtime = 'nodejs'
export const maxDuration = 60

const APP_URL = process.env.APP_URL || 'https://logistis.i-mentor.gr'
const REMINDER_INTERVAL_MS = 2 * 24 * 60 * 60 * 1000

// Sweeps every sent-but-unanswered Microcredits questionnaire and re-emails
// the client every 2 days until they respond (no cap — keeps going until
// respondedAt is set, or the consultant resets/deletes the questionnaire).
async function runSweep() {
  const now = new Date()
  const cutoff = new Date(now.getTime() - REMINDER_INTERVAL_MS)

  const due = await prisma.microcreditsQuestionnaire.findMany({
    where: {
      sentAt: { not: null },
      respondedAt: null,
      OR: [
        { lastReminderAt: null, sentAt: { lte: cutoff } },
        { lastReminderAt: { lte: cutoff } },
      ],
    },
    include: {
      business: { select: { onomasia: true, email: true } },
    },
  })

  let sent = 0
  for (const q of due) {
    if (!q.business.email) continue
    const formUrl = `${APP_URL}/microcredits-questionnaire/${q.token}`
    const ok = await sendEmail({
      to: q.business.email,
      subject: `Υπενθύμιση — Ερωτηματολόγιο για την αίτησή σας στο Ταμείο Μικροπιστώσεων`,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#374151;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius:12px 12px 0 0;overflow:hidden;">
        <tr><td bgcolor="#1e3a8a" style="background:linear-gradient(135deg,#1e3a8a,#1e40af);padding:24px 28px;">
          <h1 style="color:#ffffff;margin:0;font-size:19px;">📋 Υπενθύμιση: Ερωτηματολόγιο Επιχειρηματικού Σχεδίου</h1>
        </td></tr>
        </table>
        <div style="background:#ffffff;padding:26px 28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
          <p style="margin:0 0 16px;font-size:15px;">Αγαπητέ/ή <strong>${q.business.onomasia || ''}</strong>,</p>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.7;">
            Θα θέλαμε να σας υπενθυμίσουμε ότι εκκρεμεί η συμπλήρωση του ερωτηματολογίου για την αίτησή σας στο <strong>Ταμείο Μικροπιστώσεων (ΤΕΠΙΧ ΙΙΙ)</strong>. Παρακαλούμε συμπληρώστε το όποτε μπορέσετε, ώστε να προχωρήσουμε με τη σύνταξη του επιχειρηματικού σχεδίου.
          </p>
          <div style="text-align:center;margin:0 0 20px;">
            <a href="${formUrl}" style="display:inline-block;background:#1e3a8a;color:white;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:15px;">Συμπλήρωση Ερωτηματολογίου →</a>
          </div>
          <p style="margin:0;font-size:13px;color:#6b7280;">Αν προτιμάτε, μπορούμε να το συμπληρώσουμε μαζί τηλεφωνικά — απαντήστε σε αυτό το email.</p>
        </div>
      </div>`,
    }).catch(() => false)

    if (ok) {
      sent++
      await prisma.microcreditsQuestionnaire.update({
        where: { id: q.id },
        data: { lastReminderAt: now, reminderCount: { increment: 1 } },
      })
    }
  }

  return NextResponse.json({ ok: true, checked: due.length, sent })
}

// GET — called by an external cron scheduler (secret in query param)
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runSweep()
}

// POST — called by the Railway cron-service (Bearer token) or manually by an admin
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) return runSweep()
  const session = await auth()
  if (session?.user?.role === 'ADMIN') return runSweep()
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
