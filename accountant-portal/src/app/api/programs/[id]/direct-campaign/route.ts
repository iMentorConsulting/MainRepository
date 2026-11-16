import { NextRequest, NextResponse } from 'next/server'
import { MatchStatus } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { processCampaignSend } from '@/lib/campaign-send'
import { sendEmail } from '@/lib/email'

// One-click version of the campaign wizard for "direct" I-MENTOR clients:
//   template  → the active EMAIL template whose label contains
//               "Αναλυτικό Προγράμματος" (or body.templateKey), in its
//               "Απευθείας από I-MENTOR" body variant
//   filters   → no accountant ("Χωρίς λογιστή") AND hasn't already received a
//               sent campaign for this program ("Έχει λάβει καμπάνια: Όχι")
//   then create the campaign and start sending.
// Body: { matchIds: string[], dryRun?: boolean }  — only these matches are considered.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const matchIds: string[] = Array.isArray(body.matchIds) ? body.matchIds : []
  if (matchIds.length === 0) {
    return NextResponse.json({ error: 'Δεν επιλέχθηκαν απευθείας πελάτες' }, { status: 400 })
  }

  const programId = params.id
  const program = await prisma.program.findUnique({ where: { id: programId }, select: { id: true, title: true } })
  if (!program) return NextResponse.json({ error: 'Program not found' }, { status: 404 })

  // ── Template ────────────────────────────────────────────────────────────────
  const templates = await prisma.messageTemplate.findMany({ where: { channel: 'EMAIL', active: true } })
  const template = body.templateKey
    ? templates.find(t => t.templateKey === body.templateKey)
    : templates.find(t => t.label.toLowerCase().includes('αναλυτικό προγράμματος'))
  if (!template) {
    return NextResponse.json({
      error: 'Δεν βρέθηκε ενεργό email template με τίτλο «Αναλυτικό Προγράμματος…». Ελέγξτε τα Templates μηνυμάτων.',
    }, { status: 400 })
  }
  const messageTemplate = template.bodyDirect || template.bodyWithAccountant

  // ── Recipients: selected, un-notified, no accountant, not yet sent ──────────
  const matches = await prisma.programMatch.findMany({
    where: { id: { in: matchIds }, programId, notified: false, status: { not: MatchStatus.REJECTED } },
    include: { business: { select: { id: true, afm: true, onomasia: true, email: true, accountantId: true, excludedFromCampaigns: true } } },
  })
  const directAll = matches.filter(m => !m.business.accountantId)
  const direct = directAll.filter(m => !m.business.excludedFromCampaigns)
  const skippedExcluded = directAll.filter(m => m.business.excludedFromCampaigns)

  const alreadySent = direct.length
    ? await prisma.campaignRecipient.findMany({
        where: { businessId: { in: direct.map(m => m.business.id) }, sentAt: { not: null }, campaign: { programId } },
        select: { businessId: true },
      })
    : []
  const sentSet = new Set(alreadySent.map(r => r.businessId))

  const skippedAlreadySent = direct.filter(m => sentSet.has(m.business.id))
  const candidates = direct.filter(m => !sentSet.has(m.business.id))
  const skippedNoEmail = candidates.filter(m => !m.business.email)
  const recipients = candidates.filter(m => !!m.business.email)

  const summary = {
    templateLabel: template.label,
    recipients: recipients.length,
    skippedAlreadySent: skippedAlreadySent.length,
    skippedNoEmail: skippedNoEmail.length,
    skippedExcluded: skippedExcluded.length,
  }
  if (body.dryRun) return NextResponse.json({ dryRun: true, ...summary })

  // Every direct match that was part of this run is now HANDLED — campaign sent,
  // already contacted earlier, no email, or excluded. Marking only the campaign
  // recipients (the previous behaviour) left the skipped ones flagged as
  // un-notified, so they reappeared as "pending" after every refresh. The ones
  // that need a human (no email / excluded) are listed in an email to the team.
  const markHandled = () => prisma.programMatch.updateMany({
    where: { id: { in: directAll.map(m => m.id) } },
    data: { notified: true },
  })
  const needsHuman = [...skippedNoEmail, ...skippedExcluded]
  const notifyTeamAboutSkipped = async () => {
    if (needsHuman.length === 0) return
    const appUrl = process.env.APP_URL || 'https://logistis.i-mentor.gr'
    const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const row = (m: (typeof needsHuman)[number], why: string) =>
      `<li><a href="${appUrl}/businesses/${m.business.id}">${esc(m.business.onomasia || 'Άγνωστη επιχείρηση')}</a> (ΑΦΜ ${esc(m.business.afm)}) — ${why}</li>`
    await sendEmail({
      to: process.env.ADMIN_EMAIL || 'info@i-mentor.gr',
      subject: `📋 ${needsHuman.length} απευθείας πελάτες χωρίς αυτόματη ενημέρωση — «${program.title}»`,
      html: `<p>Για το πρόγραμμα <strong>«${esc(program.title)}»</strong> οι παρακάτω απευθείας πελάτες ταιριάζουν αλλά <strong>δεν μπορούσαν να λάβουν την αυτόματη καμπάνια</strong>. Χρειάζονται χειροκίνητη επικοινωνία (π.χ. Viber/τηλέφωνο):</p>
        <ul>${skippedNoEmail.map(m => row(m, 'χωρίς email')).join('')}${skippedExcluded.map(m => row(m, 'εξαιρείται από καμπάνιες')).join('')}</ul>`,
    }).catch(() => {})
  }

  if (recipients.length === 0) {
    await markHandled()
    await notifyTeamAboutSkipped()
    return NextResponse.json({ started: false, ...summary })
  }

  // ── Create + send ───────────────────────────────────────────────────────────
  const created = await prisma.campaign.create({
    data: {
      title: template.label,
      channel: 'EMAIL',
      subject: template.subject || template.label,
      messageTemplate,
      programId,
      accountantId: null,
      createdBy: session.user.id,
      status: 'DRAFT',
    },
  })
  const campaign = await prisma.campaign.findUnique({ where: { id: created.id }, include: { program: true, accountant: true } })

  const businessIds = recipients.map(m => m.business.id)
  const businesses = await prisma.business.findMany({
    where: { id: { in: businessIds }, excludedFromCampaigns: false },
    include: { accountant: true, activities: { where: { firmActKind: 1 }, take: 1 } },
  })
  const progMatches = await prisma.programMatch.findMany({
    where: { programId, businessId: { in: businessIds }, status: { not: MatchStatus.REJECTED } },
    select: { businessId: true, matchReason: true },
  })
  const matchReasonByBusiness = new Map(progMatches.map(m => [m.businessId, m.matchReason]))

  await markHandled()
  await notifyTeamAboutSkipped()

  processCampaignSend(campaign, businesses, matchReasonByBusiness, session.user.id)
    .catch(err => console.error(`[Campaign ${created.id}] Background send failed:`, err?.message || err))

  return NextResponse.json({ started: true, campaignId: created.id, ...summary })
}
