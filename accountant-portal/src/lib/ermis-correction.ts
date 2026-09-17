import { prisma } from './prisma'
import { sendErmisWebhook } from './ermis-webhook'
import { sendEmail } from './email'
import { sendViberMessage } from './viber'
import { buildBusinessProfilePayload, BUSINESS_PROFILE_SELECT } from './business-profile'
import { buildIneligibleViberMessage, buildIneligibleEmailHtml } from './ermis-program-payload'

// Called whenever ProgramMatch rows flip from POTENTIAL to REJECTED for a
// set of businesses — e.g. an admin tightened a program's eligibility
// criteria (added an excluded ΚΑΔ, etc.) after Case Management was already
// told, via ermis.business_ready/ermis.completed, that one of these
// businesses was eligible. Without this, CM keeps showing stale "eligible"
// data and the client never hears back — this notifies CM (so it can cancel
// the lead) and the client (so they get an honest answer), and only for
// businesses that actually have a CM-originated session for that exact
// program and haven't already become a real case.
export async function notifyStaleMatchesBecameIneligible(programId: string, businessIds: string[]): Promise<void> {
  if (businessIds.length === 0) return

  const tokens = await prisma.businessMatchToken.findMany({
    where: {
      programId,
      businessId: { in: businessIds },
      callbackUrl: { not: null },
      caseCreatedId: null,
      eligibilityStatus: { not: 'NOT_ELIGIBLE' },
    },
  })
  if (tokens.length === 0) return

  const program = await prisma.program.findUnique({ where: { id: programId }, select: { title: true } })
  if (!program) return

  for (const token of tokens) {
    try {
      const business = await prisma.business.findUnique({
        where: { id: token.businessId },
        select: { ...BUSINESS_PROFILE_SELECT, afm: true, id: true },
      })
      if (!business) continue

      const clientName = business.onomasia || business.commercialTitle || business.afm

      if (token.callbackUrl) {
        const profile = await buildBusinessProfilePayload(business)
        await sendErmisWebhook({
          callbackUrl: token.callbackUrl,
          event: 'ermis.completed',
          token: token.token,
          leadRef: token.leadRef,
          afm: business.afm,
          businessProfile: profile,
          program: program.title,
          eligibility: 'ineligible',
          transcript: [],
          completedAt: new Date().toISOString(),
        })
      }

      if (token.contactPhone) {
        const text = buildIneligibleViberMessage({ businessName: clientName, programTitle: program.title, consultant: token.consultant })
        sendViberMessage({ to: token.contactPhone, text, senderName: 'iMentor Consulting' })
          .catch(err => console.error('[ErmisCorrection] client Viber failed:', err?.message))
      }
      if (token.contactEmail) {
        sendEmail({
          to: token.contactEmail,
          subject: `Ενημέρωση επιλεξιμότητας — ${program.title}`,
          html: buildIneligibleEmailHtml({ businessName: clientName, programTitle: program.title, consultant: token.consultant }),
        }).catch(err => console.error('[ErmisCorrection] client email failed:', err?.message))
      }

      await prisma.businessMatchToken.update({
        where: { id: token.id },
        data: { eligibilityStatus: 'NOT_ELIGIBLE' },
      })

      console.log(`[ErmisCorrection] notified CM + client of corrected ineligibility: business ${business.afm}, program "${program.title}"`)
    } catch (err: any) {
      console.error(`[ErmisCorrection] failed to notify for token ${token.id}:`, err?.message)
    }
  }
}
