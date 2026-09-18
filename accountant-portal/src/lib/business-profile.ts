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
  activities: { firmActCode: string; firmActDescr: string | null; firmActKind: number | null }[] // raw from DB; output converts to string
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
      firmActKind: a.firmActKind != null ? String(a.firmActKind) : null,
    })),
    matchedPrograms: matches.map(m => ({ title: m.program.title, status: m.status })),
  }
}

export type BusinessProfilePayload = Awaited<ReturnType<typeof buildBusinessProfilePayload>>

export interface AadeBusinessDetails {
  onomasia: string | null
  afm: string
  address: string | null
  mainKad: string | null
}

// Same "proof we already ran a real AADE lookup" card shown in every
// multi-program eligibility email — Moosend/website-widget leads (built from
// GemiLookup) and Case Management leads (built from Business) alike.
export function buildAadeBusinessDetails(business: {
  afm: string
  onomasia: string | null
  postalAddress: string | null
  postalAddressNo: string | null
  postalZipCode: string | null
  postalAreaDescription: string | null
  activities: { firmActCode: string; firmActDescr: string | null; firmActKind: number | null }[]
}): AadeBusinessDetails {
  const addressParts = [
    [business.postalAddress, business.postalAddressNo].filter(Boolean).join(' '),
    [business.postalZipCode, business.postalAreaDescription].filter(Boolean).join(' '),
  ].filter(Boolean)

  const mainActivity = business.activities.find(a => a.firmActKind === 1) || business.activities[0]
  const mainKad = mainActivity
    ? [mainActivity.firmActCode, mainActivity.firmActDescr].filter(Boolean).join(' — ')
    : null

  return {
    onomasia: business.onomasia,
    afm: business.afm,
    address: addressParts.length > 0 ? addressParts.join(', ') : null,
    mainKad,
  }
}

// Shared HTML card for every multi-program eligibility email (Moosend/website
// widget and Case Management leads alike) — "proof we already ran a real
// AADE lookup" rather than a generic pitch.
export function buildAadeBusinessDetailsCardHtml(details: AadeBusinessDetails | undefined | null): string {
  if (!details) return ''

  const rows = [
    ['Επωνυμία', details.onomasia],
    ['ΑΦΜ', details.afm],
    ['Διεύθυνση', details.address],
    ['Κύριος ΚΑΔ', details.mainKad],
  ].filter(([, value]) => !!value)

  if (rows.length === 0) return ''

  const rowsHtml = rows.map(([label, value]) => `
    <tr>
      <td style="padding:4px 12px 4px 0;font-size:12.5px;color:#6b7280;white-space:nowrap;vertical-align:top;">${label}</td>
      <td style="padding:4px 0;font-size:13px;color:#111827;font-weight:600;">${value}</td>
    </tr>`).join('')

  return `
    <div style="background:#f3f4f6;border:1px solid #e5e7eb;border-radius:10px;padding:14px 18px;margin-bottom:20px;">
      <p style="margin:0 0 8px;font-size:11.5px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.4px;">🔍 Στοιχεία Επιχείρησης (από ΑΑΔΕ)</p>
      <table style="border-collapse:collapse;">${rowsHtml}</table>
    </div>`
}
