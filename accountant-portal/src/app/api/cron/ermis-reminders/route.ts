import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendEmail, renderCampaignEmailHtml } from '@/lib/email'
import { sendViberMessage } from '@/lib/viber'

export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET

function buildEmailHtml(opts: {
  businessName: string
  programTitle: string
  ermisLink: string
  isEligible: boolean
}): string {
  const { businessName, programTitle, ermisLink, isEligible } = opts

  const bodyText = isEligible
    ? `Αγαπητέ/ή ${businessName},\n\nΟ Ερμής, ο ψηφιακός σύμβουλος της I-MENTOR, σας πληροφορεί ότι η επιχείρησή σας φαίνεται ΕΠΙΛΕΞΙΜΗ για το πρόγραμμα "${programTitle}".\n\nΑπομένει μόνο ένα βήμα — συνεχίστε τη συνομιλία για να σας παραπέμψουμε στον αρμόδιο σύμβουλό μας.\n\nΠατήστε τον παρακάτω σύνδεσμο για να συνεχίσετε:`
    : `Αγαπητέ/ή ${businessName},\n\nΠαρατηρήσαμε ότι δεν ολοκληρώσατε τη συνομιλία με τον Ερμή σχετικά με το πρόγραμμα "${programTitle}".\n\nΟι απαντήσεις σας έχουν αποθηκευτεί — μπορείτε να συνεχίσετε ακριβώς από εκεί που μείνατε.\n\nΠατήστε τον παρακάτω σύνδεσμο για να συνεχίσετε:`

  return renderCampaignEmailHtml({
    title: isEligible
      ? `Η επιχείρησή σας είναι ΕΠΙΛΕΞΙΜΗ — ολοκληρώστε τη συνομιλία με τον Ερμή`
      : `Συνεχίστε τη συνομιλία σας με τον Ερμή`,
    bodyText,
    recipientName: businessName,
    ermisLink,
  })
}

function buildViberText(opts: {
  businessName: string
  programTitle: string
  ermisLink: string
  isEligible: boolean
}): string {
  const { businessName, programTitle, ermisLink, isEligible } = opts
  if (isEligible) {
    return `Γεια σας ${businessName}! Η επιχείρησή σας φαίνεται *ΕΠΙΛΕΞΙΜΗ* για το πρόγραμμα "${programTitle}". Ολοκληρώστε τη συνομιλία με τον Ερμή για να σας παραπέμψουμε στον σύμβουλό μας: ${ermisLink}`
  }
  return `Γεια σας ${businessName}! Θυμηθείτε να ολοκληρώσετε τη συνομιλία σας με τον Ερμή για το πρόγραμμα "${programTitle}". Οι απαντήσεις σας είναι αποθηκευμένες — συνεχίστε εδώ: ${ermisLink}`
}

export async function GET(request: NextRequest) {
  if (CRON_SECRET) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const now = new Date()
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000)
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const appUrl = process.env.APP_URL || 'https://logistis.i-mentor.gr'

  let email1Sent = 0
  let email1Failed = 0
  let viber2Sent = 0
  let viber2Failed = 0

  // ── Reminder 1: email, 6h after last activity ─────────────────────────────
  // Exclude CM-initiated sessions (callbackUrl set) — CM manages its own follow-up
  const reminder1Candidates = await prisma.businessMatchToken.findMany({
    where: {
      callbackUrl: null,
      clientRepliedAt: { not: null },
      caseCreatedId: null,
      lastActivityAt: { lt: sixHoursAgo },
      reminder1SentAt: null,
    },
  })

  if (reminder1Candidates.length > 0) {
    const businessIds = reminder1Candidates.map(t => t.businessId)
    const programIds = reminder1Candidates.map(t => t.programId)

    const [businesses, programs] = await Promise.all([
      prisma.business.findMany({ where: { id: { in: businessIds } }, select: { id: true, onomasia: true, afm: true, email: true } }),
      prisma.program.findMany({ where: { id: { in: programIds } }, select: { id: true, title: true } }),
    ])

    const bizById = new Map(businesses.map(b => [b.id, b]))
    const progById = new Map(programs.map(p => [p.id, p]))

    for (const t of reminder1Candidates) {
      const biz = bizById.get(t.businessId)
      const prog = progById.get(t.programId)
      const email = biz?.email

      // Always mark reminder1SentAt to avoid retrying indefinitely for no-email cases
      if (!email) {
        await prisma.businessMatchToken.update({ where: { id: t.id }, data: { reminder1SentAt: now } })
        console.log(`[ErmisReminders] reminder1 skipped (no email): token ${t.token}`)
        email1Failed++
        continue
      }

      const isEligible = t.eligibilityStatus === 'ELIGIBLE'
      const businessName = biz.onomasia || biz.afm
      const ermisLink = `${appUrl}/e/${t.token}`
      const programTitle = prog?.title || ''

      const subject = isEligible
        ? `Η επιχείρησή σας είναι επιλέξιμη — συνεχίστε με τον Ερμή`
        : `Συνεχίστε τη συνομιλία σας με τον Ερμή`

      const ok = await sendEmail({
        to: email,
        subject,
        html: buildEmailHtml({ businessName, programTitle, ermisLink, isEligible }),
      })

      await prisma.businessMatchToken.update({ where: { id: t.id }, data: { reminder1SentAt: now } })

      if (ok) {
        email1Sent++
        console.log(`[ErmisReminders] reminder1 email sent to ${email} for token ${t.token}`)
      } else {
        email1Failed++
      }
    }
  }

  // ── Reminder 2: Viber, 24h after reminder 1 ───────────────────────────────
  // Exclude CM-initiated sessions — same reasoning as reminder 1
  const reminder2Candidates = await prisma.businessMatchToken.findMany({
    where: {
      callbackUrl: null,
      caseCreatedId: null,
      reminder1SentAt: { not: null, lt: twentyFourHoursAgo },
      reminder2SentAt: null,
    },
  })

  if (reminder2Candidates.length > 0) {
    const businessIds = reminder2Candidates.map(t => t.businessId)
    const programIds = reminder2Candidates.map(t => t.programId)

    const [businesses, programs] = await Promise.all([
      prisma.business.findMany({ where: { id: { in: businessIds } }, select: { id: true, onomasia: true, afm: true, viberPhone: true, phone: true } }),
      prisma.program.findMany({ where: { id: { in: programIds } }, select: { id: true, title: true } }),
    ])

    const bizById = new Map(businesses.map(b => [b.id, b]))
    const progById = new Map(programs.map(p => [p.id, p]))

    for (const t of reminder2Candidates) {
      const biz = bizById.get(t.businessId)
      const prog = progById.get(t.programId)
      const phone = biz?.viberPhone || biz?.phone

      // Always mark reminder2SentAt to avoid infinite retries
      if (!phone) {
        await prisma.businessMatchToken.update({ where: { id: t.id }, data: { reminder2SentAt: now } })
        console.log(`[ErmisReminders] reminder2 skipped (no phone): token ${t.token}`)
        viber2Failed++
        continue
      }

      const isEligible = t.eligibilityStatus === 'ELIGIBLE'
      const businessName = biz!.onomasia || biz!.afm
      const ermisLink = `${appUrl}/e/${t.token}`
      const programTitle = prog?.title || ''

      const result = await sendViberMessage({
        to: phone,
        text: buildViberText({ businessName, programTitle, ermisLink, isEligible }),
        senderName: businessName,
      })

      await prisma.businessMatchToken.update({ where: { id: t.id }, data: { reminder2SentAt: now } })

      if (result.ok) {
        viber2Sent++
        console.log(`[ErmisReminders] reminder2 Viber sent to ${phone} for token ${t.token}`)
      } else {
        viber2Failed++
      }
    }
  }

  console.log(`[ErmisReminders] email1: ${email1Sent} sent, ${email1Failed} failed | viber2: ${viber2Sent} sent, ${viber2Failed} failed`)
  return NextResponse.json({ email1Sent, email1Failed, viber2Sent, viber2Failed })
}
