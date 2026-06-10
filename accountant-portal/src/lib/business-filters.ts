import { Prisma } from '@prisma/client'

// Individuals (ΙΔΙΩΤΗΣ) are not real businesses — exclude them from all
// business counts, charts, leaderboards, and gamification points.
export function isIndividualLegalStatus(legalStatusDescr: string | null | undefined): boolean {
  const s = (legalStatusDescr || '').toUpperCase()
  return s.includes('ΙΔΙΩΤΗΣ')
}

// Prisma where-clause fragment to exclude ΙΔΙΩΤΗΣ rows at the query level.
export const notIndividualWhere: Prisma.BusinessWhereInput = {
  NOT: { legalStatusDescr: { contains: 'ΙΔΙΩΤΗΣ', mode: 'insensitive' } },
}
