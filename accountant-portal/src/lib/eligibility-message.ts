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
  options: { mode: 'direct' | 'accountant'; channels: Set<'email' | 'viber'>; markSent?: boolean; dryRun?: boolean }
): Promise<EligibilityMessageOutcome> {
  const { mode, channels, markSent = true, dryRun = false } = options

  const accountantCache = new Map<string, AccountantMentionInfo | null>()
  async function getAccountantInfo(accountantId: string | null): Promise<AccountantMentionInfo | null> {
    if (mode !== 'accountant' || !accountantId) return null
    if (accountantCache.has(accountantId)) return accountantCache.get(accountantId)!
    const acc = await prisma.accountant.findUnique({ where: { id: accountantId }, select: { officeName: true, contactPerson: true, logoUrl: true } })
    const info = acc ? { officeName: acc.officeName, contactPerson: acc.contactPerson, logoUrl: acc.logoUrl } : null
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
        // dryRun still runs the real eligibility check (so the preview count
        // is accurate) but never actually calls the email/Viber providers or
        // writes to the DB — used for the "how many will this actually send"
        // warning shown before a real send.
        if (channels.has('email') && b.email) {
          if (!dryRun) {
            const accountantInfo = await getAccountantInfo(b.accountantId)
            await sendEmail({
              to: b.email,
              subject: buildEligibilitySubject(result.businessName, result.programs.length, accountantInfo),
              html: buildEligibilityEmailHtml({ businessName: result.businessName, programs: result.programs, businessDetails: result.businessDetails, accountantInfo }),
            })
          }
          sentEmail++
        }
        const viberNumber = b.viberPhone || b.phone
        if (channels.has('viber') && viberNumber) {
          if (!dryRun) {
            const accountantInfo = await getAccountantInfo(b.accountantId)
            const viberResult = await sendViberMessage({
              to: viberNumber,
              text: buildEligibilityViberText({ businessName: result.businessName, programs: result.programs, accountantInfo }),
              senderName: 'I-MENTOR',
            })
            if (viberResult.ok) sentViber++
          } else {
            sentViber++
          }
        }
      } else {
        ineligible++
      }
      if (markSent && !dryRun) await prisma.business.update({ where: { id: b.id }, data: { eligibilityEmailSentAt: new Date() } })
    } catch (err: any) {
      failed++
      console.error(`[EligibilityMessage] ΑΦΜ ${b.afm} failed:`, err?.message)
      if (markSent && !dryRun) {
        // Still mark as processed — a persistently-failing ΑΦΜ (e.g. AADE down
        // for that lookup) would otherwise block every future batch forever.
        await prisma.business.update({ where: { id: b.id }, data: { eligibilityEmailSentAt: new Date() } }).catch(() => {})
      }
    }
  })

  return { processed: targets.length, sentEmail, sentViber, ineligible, failed }
}

// Sends ONE real message (using real, current eligibility data) to an
// explicit test email/phone instead of any real business's own contact
// info — lets an admin see exactly what a bulk send will look like before
// firing it at the real target list. Picks the first target (in the given
// order) that currently has ≥1 eligible program; nothing is marked as sent
// and no other target is touched.
export async function sendEligibilityMessageTest(
  targets: EligibilityMessageTarget[],
  options: { mode: 'direct' | 'accountant'; channels: Set<'email' | 'viber'>; testEmail?: string; testPhone?: string }
): Promise<{ found: boolean; businessName?: string | null; afm?: string; programCount?: number; sentEmail: boolean; sentViber: boolean }> {
  const { mode, channels, testEmail, testPhone } = options

  for (const b of targets) {
    let result
    try {
      result = await checkEligibilityForAfm(b.afm, b.email, b.phone)
    } catch {
      continue
    }
    if (result.notFound || result.inactive || result.programs.length === 0) continue

    let accountantInfo: AccountantMentionInfo | null = null
    if (mode === 'accountant' && b.accountantId) {
      const acc = await prisma.accountant.findUnique({ where: { id: b.accountantId }, select: { officeName: true, contactPerson: true, logoUrl: true } })
      accountantInfo = acc ? { officeName: acc.officeName, contactPerson: acc.contactPerson, logoUrl: acc.logoUrl } : null
    }

    let sentEmail = false
    let sentViber = false
    if (channels.has('email') && testEmail) {
      await sendEmail({
        to: testEmail,
        subject: `[ΔΟΚΙΜΗ] ${buildEligibilitySubject(result.businessName, result.programs.length, accountantInfo)}`,
        html: buildEligibilityEmailHtml({ businessName: result.businessName, programs: result.programs, businessDetails: result.businessDetails, accountantInfo }),
      })
      sentEmail = true
    }
    if (channels.has('viber') && testPhone) {
      const viberResult = await sendViberMessage({
        to: testPhone,
        text: `[ΔΟΚΙΜΗ]\n\n${buildEligibilityViberText({ businessName: result.businessName, programs: result.programs, accountantInfo })}`,
        senderName: 'I-MENTOR',
      })
      sentViber = viberResult.ok
    }

    return { found: true, businessName: result.businessName, afm: b.afm, programCount: result.programs.length, sentEmail, sentViber }
  }

  return { found: false, sentEmail: false, sentViber: false }
}
