// Builds the enriched AADE-derived business profile shared with the inhouse
// Case Management app — both via the case-creation webhook (case-management-sync.ts)
// and the /api/external/businesses lookup endpoint, so the two delivery paths
// never drift apart in shape.
import { prisma } from './prisma'
import { resolveRegionFromZip } from './greek-regions'
import { getEffectiveCategory } from './business-categories'

export interface BusinessForProfile {
  id: string
  afm: string
  onomasia: string | null
  commercialTitle: string | null
  legalStatusDescr: string | null
  regdate: string | null
  doy: string | null
  doyDescr: string | null
  postalAddress: string | null
  postalAddressNo: string | null
  postalZipCode: string | null
  postalAreaDescription: string | null
  tags: string[]
  activities: { firmActCode: string; firmActDescr: string | null; firmActKind: number | null }[]
}

export const BUSINESS_PROFILE_SELECT = {
  id: true,
  afm: true,
  onomasia: true,
  commercialTitle: true,
  legalStatusDescr: true,
  regdate: true,
  doy: true,
  doyDescr: true,
  postalAddress: true,
  postalAddressNo: true,
  postalZipCode: true,
  postalAreaDescription: true,
  tags: true,
  activities: { select: { firmActCode: true, firmActDescr: true, firmActKind: true } },
} as const

export async function buildBusinessProfilePayload(business: BusinessForProfile) {
  const perifereia = resolveRegionFromZip(business.postalZipCode)
  const klados = getEffectiveCategory(business)

  // REJECTED covers manual rejections and the auto-matcher's "no longer
  // qualifies" flag — neither belongs in what the consultant sees as the
  // business's live matched programs (consistent with /api/matches).
  const matches = await prisma.programMatch.findMany({
    where: { businessId: business.id, status: { not: 'REJECTED' } },
    select: { status: true, program: { select: { title: true } } },
  })

  return {
    afm: business.afm,
    onomasia: business.onomasia,
    commercialTitle: business.commercialTitle,
    legalStatusDescr: business.legalStatusDescr,
    regdate: business.regdate,
    doy: business.doy,
    doyDescr: business.doyDescr,
    postalAddress: business.postalAddress,
    postalAddressNo: business.postalAddressNo,
    postalZipCode: business.postalZipCode,
    postalAreaDescription: business.postalAreaDescription,
    perifereia,
    klados,
    activities: business.activities.map(a => ({
      firmActCode: a.firmActCode,
      firmActDescr: a.firmActDescr,
      firmActKind: a.firmActKind,
    })),
    matchedPrograms: matches.map(m => ({ title: m.program.title, status: m.status })),
  }
}

export type BusinessProfilePayload = Awaited<ReturnType<typeof buildBusinessProfilePayload>>
