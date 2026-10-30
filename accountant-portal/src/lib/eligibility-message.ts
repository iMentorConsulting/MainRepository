import { prisma } from '@/lib/prisma'
import { checkEligibilityForAfm } from '@/lib/eligibility-check-core'
import { buildEligibilitySubject, buildEligibilityEmailHtml, buildEligibilityViberText, AccountantMentionInfo } from '@/lib/eligibility-email'
import { sendEmail } from '@/lib/email'
import { sendViberMessage } from '@/lib/viber'
import { mapWithConcurrency } from '@/lib/concurrency'

export interface EligibilityMessageTarget {
  id: string
  afm: string
  email: string | null
  phone: string | null
  viberPhone: string | null
  accountantId: string | null
}

export interface EligibilityMessageOutcome {
  processed: number
  sentEmail: number
  sentViber: number
  ineligible: number
  failed: number
}

// Shared by every entry point that sends the combined "Βρέθηκαν διαθέσιμα
// προγράμματα" message to businesses: the admin bulk backfill-by-filter tool,
// and accountant/admin-triggered sends to an explicit list of businesses
// (Matches page bulk action, single business page, Campaigns page). Each
// business is re-checked against every active program right now — not
// against a stale cached match list — so the message always reflects
// current eligibility.
export async function sendEligibilityMessages(
  targets: EligibilityMessageTarget[],
  options: { mode: 'direct' | 'accountant'; channels: Set<'email' | 'viber'>; markSent?: boolean }
): Promise<EligibilityMessageOutcome> {
  const { mode, channels, markSent = true } = options

  const accountantCache = new Map<string, AccountantMentionInfo | null>()
  async function getAccountantInfo(accountantId: string | null): Promise<AccountantMentionInfo | null> {
    if (mode !== 'accountant' || !accountantId) return null
    if (accountantCache.has(accountantId)) return accountantCache.get(accountantId)!
    const acc = await prisma.accountant.findUnique({ where: { id: accountantId }, select: { officeName: true, contactPerson: true } })
    const info = acc ? { officeName: acc.officeName, contactPerson: acc.contactPerson } : null
    accountantCache.set(accountantId, info)
    return info
  }

  let sentEmail = 0
  let sentViber = 0
  let ineligible = 0
  let failed = 0

  await mapWithConcurrency(targets, 5, async (b) => {
    try {
      const result = await checkEligibilityForAfm(b.afm, b.email, b.phone)
      if (!result.notFound && !result.inactive && result.programs.length > 0) {
        const accountantInfo = await getAccountantInfo(b.accountantId)
        if (channels.has('email') && b.email) {
          await sendEmail({
            to: b.email,
            subject: buildEligibilitySubject(result.businessName, result.programs.length),
            html: buildEligibilityEmailHtml({ businessName: result.businessName, programs: result.programs, businessDetails: result.businessDetails, accountantInfo }),
          })
          sentEmail++
        }
        const viberNumber = b.viberPhone || b.phone
        if (channels.has('viber') && viberNumber) {
          const viberResult = await sendViberMessage({
            to: viberNumber,
            text: buildEligibilityViberText({ businessName: result.businessName, programs: result.programs, accountantInfo }),
            senderName: 'I-MENTOR',
          })
          if (viberResult.ok) sentViber++
        }
      } else {
        ineligible++
      }
      if (markSent) await prisma.business.update({ where: { id: b.id }, data: { eligibilityEmailSentAt: new Date() } })
    } catch (err: any) {
      failed++
      console.error(`[EligibilityMessage] ΑΦΜ ${b.afm} failed:`, err?.message)
      if (markSent) {
        // Still mark as processed — a persistently-failing ΑΦΜ (e.g. AADE down
        // for that lookup) would otherwise block every future batch forever.
        await prisma.business.update({ where: { id: b.id }, data: { eligibilityEmailSentAt: new Date() } }).catch(() => {})
      }
    }
  })

  return { processed: targets.length, sentEmail, sentViber, ineligible, failed }
}
