// Maps a business's primary ΚΑΔ (NACE activity code) to one of the major
// portfolio categories used for reporting/segmentation.
export const BUSINESS_CATEGORIES = ['ΤΟΥΡΙΣΜΟΣ', 'ΕΜΠΟΡΙΟ', 'ΜΕΤΑΠΟΙΗΣΗ', 'ΕΣΤΙΑΣΗ', 'ΥΠΗΡΕΣΙΕΣ'] as const
export type BusinessCategory = typeof BUSINESS_CATEGORIES[number] | 'ΑΛΛΟ'

// 2-digit NACE division -> category
const DIVISION_TO_CATEGORY: Record<string, BusinessCategory> = {
  '55': 'ΤΟΥΡΙΣΜΟΣ', // Καταλύματα
  '79': 'ΤΟΥΡΙΣΜΟΣ', // Ταξιδιωτικά πρακτορεία
  '56': 'ΕΣΤΙΑΣΗ',   // Δραστηριότητες υπηρεσιών εστίασης
  '45': 'ΕΜΠΟΡΙΟ',
  '46': 'ΕΜΠΟΡΙΟ',
  '47': 'ΕΜΠΟΡΙΟ',
}

function isManufacturing(division: number): boolean {
  return division >= 10 && division <= 33
}

// Resolves a category from a business's primary ΚΑΔ code (e.g. "56.10" or "5610").
export function categorizeByKad(firmActCode: string | null | undefined): BusinessCategory {
  if (!firmActCode) return 'ΑΛΛΟ'
  const digits = firmActCode.replace(/\D/g, '')
  if (digits.length < 2) return 'ΑΛΛΟ'
  const division2 = digits.slice(0, 2)
  if (DIVISION_TO_CATEGORY[division2]) return DIVISION_TO_CATEGORY[division2]
  const divisionNum = parseInt(division2, 10)
  if (isManufacturing(divisionNum)) return 'ΜΕΤΑΠΟΙΗΣΗ'
  // Sections G(45-47)/I(55-56) handled above; everything else falls back to services.
  return 'ΥΠΗΡΕΣΙΕΣ'
}
