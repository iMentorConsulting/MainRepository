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

export function isIndividualLike(business: {
  legalStatusDescr?: string | null
  activities?: Array<{ firmActCode?: string | null; firmActKind?: number | null }>
}): boolean {
  if (isIndividualLegalStatus(business.legalStatusDescr)) return true
  const primary = business.activities?.find(a => a.firmActKind === 1)
  if (!primary?.firmActCode) return true
  if (primary.firmActCode.replace(/\D/g, '').startsWith(FARMER_SPECIAL_REGIME_CODE)) return true
  return false
}

// Prisma where-clause fragment to exclude ΙΔΙΩΤΗΣ rows, businesses with no
// primary ΚΑΔ, and special-regime farmers, at the query level.
export const notIndividualWhere: Prisma.BusinessWhereInput = {
  AND: [
    { NOT: { legalStatusDescr: { contains: 'ΙΔΙΩΤΗΣ', mode: 'insensitive' } } },
    { activities: { some: { firmActKind: 1, NOT: { firmActCode: { startsWith: FARMER_SPECIAL_REGIME_CODE } } } } },
  ],
}
