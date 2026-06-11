import { Prisma } from '@prisma/client'

// Special ΑΑΔΕ ΚΑΔ used to flag farmers under the special VAT regime
// ("ΑΓΡΟΤΗΣ ΕΙΔΙΚΟΥ ΚΑΘΕΣΤΩΤΟΣ") — treated like individuals, not businesses.
export const FARMER_SPECIAL_REGIME_CODE = '1000000'

// Individuals (ΙΔΙΩΤΗΣ), entries with no registered ΚΑΔ at all, and special-regime
// farmers (ΚΑΔ 1000000) are not real businesses — exclude them from all
// business counts, charts, leaderboards, and gamification points.
export function isIndividualLegalStatus(legalStatusDescr: string | null | undefined): boolean {
  const s = (legalStatusDescr || '').toUpperCase()
  return s.includes('ΙΔΙΩΤΗΣ')
}

// Real ΑΓΡΟΤΙΚΑ NACE divisions (Φυτική/ζωική παραγωγή, Δασοκομία, Αλιεία) — these
// businesses are treated like individuals and hidden from lists/reports by default.
export const AGRICULTURAL_DIVISIONS = ['01', '02', '03']

export function isIndividualLike(business: {
  legalStatusDescr?: string | null
  activities?: Array<{ firmActCode?: string | null; firmActKind?: number | null }>
}): boolean {
  if (isIndividualLegalStatus(business.legalStatusDescr)) return true
  const primary = business.activities?.find(a => a.firmActKind === 1)
  if (!primary?.firmActCode) return true
  const digits = primary.firmActCode.replace(/\D/g, '')
  if (digits.startsWith(FARMER_SPECIAL_REGIME_CODE)) return true
  const padded = digits.length === 7 ? '0' + digits : digits
  if (AGRICULTURAL_DIVISIONS.includes(padded.slice(0, 2))) return true
  return false
}

// Businesses that AADE shows as deactivated ("Παύση Εργασιών") — should never be
// matched against programs and should be easy to find/cleanup.
export function isInactiveBusiness(business: { deactivationFlag?: string | null; stopDate?: string | null }): boolean {
  return business.deactivationFlag === 'Y' || !!business.stopDate
}

export const inactiveBusinessWhere: Prisma.BusinessWhereInput = {
  OR: [{ deactivationFlag: 'Y' }, { NOT: { stopDate: null } }],
}
// primary ΚΑΔ, special-regime farmers, and real ΑΓΡΟΤΙΚΑ businesses, at the query level.
export const notIndividualWhere: Prisma.BusinessWhereInput = {
  AND: [
    { NOT: { legalStatusDescr: { contains: 'ΙΔΙΩΤΗΣ', mode: 'insensitive' } } },
    {
      activities: {
        some: {
          firmActKind: 1,
          NOT: {
            OR: [
              { firmActCode: { startsWith: FARMER_SPECIAL_REGIME_CODE } },
              ...AGRICULTURAL_DIVISIONS.map(d => ({ firmActCode: { startsWith: d } })),
            ],
          },
        },
      },
    },
  ],
}
