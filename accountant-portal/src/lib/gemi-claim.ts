import { prisma } from './prisma'
import { runMatchingForBusiness } from './matching'
import type { GemiLookup } from '@prisma/client'

// Core of "ανάκτηση" — turns an unclaimed ΓΕΜΗ lead into a real Business
// record (creating one, or linking an existing Business with the same ΑΦΜ),
// copying over activities, and kicking off matching for it. Shared by the
// manual claim button (api/gemi/businesses/[id]/claim) and the automatic
// claim-on-send below — both just need the end result (a linked Business),
// the manual route additionally handles its own permission/409 checks
// before calling this.
export async function claimGemiLookup(gemiLookup: GemiLookup, accountantId: string | null) {
  const activities: Array<{
    firmActCode: string
    firmActDescr?: string
    firmActKind?: number
    firmActKindDescr?: string
  }> = Array.isArray(gemiLookup.activities) ? (gemiLookup.activities as any[]) : []

  let business = await prisma.business.findUnique({ where: { afm: gemiLookup.afm } })

  if (business) {
    const updateData: Record<string, any> = {}
    if (!business.email && gemiLookup.email) updateData.email = gemiLookup.email
    if (!business.phone && gemiLookup.phone) updateData.phone = gemiLookup.phone
    if (!business.accountantId && accountantId) updateData.accountantId = accountantId
    if (!business.tags.includes('ΓΕΜΗ')) updateData.tags = { push: 'ΓΕΜΗ' }

    if (Object.keys(updateData).length > 0) {
      business = await prisma.business.update({ where: { id: business.id }, data: updateData })
    }
  } else {
    business = await prisma.business.create({
      data: {
        afm: gemiLookup.afm,
        onomasia: gemiLookup.onomasia ?? undefined,
        email: gemiLookup.email ?? undefined,
        phone: gemiLookup.phone ?? undefined,
        legalStatusDescr: gemiLookup.legalStatusDescr ?? undefined,
        postalAddress: gemiLookup.postalAddress ?? undefined,
        postalAddressNo: gemiLookup.postalAddressNo ?? undefined,
        postalZipCode: gemiLookup.postalZipCode ?? undefined,
        postalAreaDescription: gemiLookup.postalAreaDescription ?? undefined,
        doy: gemiLookup.doy ?? undefined,
        doyDescr: gemiLookup.doyDescr ?? undefined,
        regdate: gemiLookup.regdate ?? undefined,
        deactivationFlag: gemiLookup.deactivationFlag ?? undefined,
        stopDate: gemiLookup.stopDate ?? undefined,
        source: 'gemi-claim',
        tags: ['ΓΕΜΗ'],
        accountantId: accountantId ?? undefined,
      },
    })
  }

  if (activities.length > 0) {
    for (const act of activities) {
      if (!act.firmActCode) continue
      const existing = await prisma.businessActivity.findFirst({
        where: { businessId: business.id, firmActCode: act.firmActCode },
      })
      if (!existing) {
        await prisma.businessActivity.create({
          data: {
            businessId: business.id,
            firmActCode: act.firmActCode,
            firmActDescr: act.firmActDescr ?? undefined,
            firmActKind: act.firmActKind ?? undefined,
            firmActKindDescr: act.firmActKindDescr ?? undefined,
          },
        })
      }
    }
  }

  await prisma.gemiLookup.update({
    where: { id: gemiLookup.id },
    data: { claimedBusinessId: business.id, claimedAccountantId: accountantId, claimedAt: new Date() },
  })

  runMatchingForBusiness(business.id).catch(err =>
    console.error('[GemiClaim] auto-matching failed:', err instanceof Error ? err.message : err)
  )

  return business
}

// Called after successfully sending any client-facing email to a ΓΕΜΗ lead
// (program-info, microcredits, advisory) — the office's rule: once a lead
// has actually been contacted and it's a real back-and-forth, it's no
// longer a cold ΓΕΜΗ lead, it's a live I-MENTOR prospect, so it should
// become a normal Business for everything else in the app to pick up
// (campaigns, matching, Case Management history, etc). No-op if it's
// already claimed. Never throws — a claim failure must not break the send
// that triggered it.
export async function autoClaimGemiOnSend(gemiLookup: GemiLookup): Promise<boolean> {
  if (gemiLookup.claimedBusinessId) return false
  try {
    await claimGemiLookup(gemiLookup, null)
    console.log(`[GemiClaim] auto-claimed ΑΦΜ ${gemiLookup.afm} after email send`)
    return true
  } catch (err: any) {
    console.error(`[GemiClaim] auto-claim after send failed for ΑΦΜ ${gemiLookup.afm}:`, err?.message)
    return false
  }
}
