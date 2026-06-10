// Maps a business's primary ΚΑΔ (NACE activity code) to one of the major
// portfolio categories used for reporting/segmentation.
export const BUSINESS_CATEGORIES = ['ΤΟΥΡΙΣΜΟΣ', 'ΕΜΠΟΡΙΟ', 'ΜΕΤΑΠΟΙΗΣΗ', 'ΕΣΤΙΑΣΗ', 'ΥΠΗΡΕΣΙΕΣ', 'ΑΓΡΟΤΙΚΑ'] as const
export type BusinessCategory = typeof BUSINESS_CATEGORIES[number] | 'ΑΛΛΟ'
export const ALL_CATEGORIES: BusinessCategory[] = [...BUSINESS_CATEGORIES, 'ΑΛΛΟ']

// lucide-react icon name for each category (used to render a representative pic/icon)
export const CATEGORY_ICONS: Record<BusinessCategory, string> = {
  'ΤΟΥΡΙΣΜΟΣ': 'Palmtree',
  'ΕΜΠΟΡΙΟ': 'ShoppingCart',
  'ΜΕΤΑΠΟΙΗΣΗ': 'Factory',
  'ΕΣΤΙΑΣΗ': 'UtensilsCrossed',
  'ΥΠΗΡΕΣΙΕΣ': 'Briefcase',
  'ΑΓΡΟΤΙΚΑ': 'Wheat',
  'ΑΛΛΟ': 'Tag',
}

// Brand color for each category, used for badges/icons
export const CATEGORY_COLORS: Record<BusinessCategory, string> = {
  'ΤΟΥΡΙΣΜΟΣ': '#0ea5e9',
  'ΕΜΠΟΡΙΟ': '#d97706',
  'ΜΕΤΑΠΟΙΗΣΗ': '#64748b',
  'ΕΣΤΙΑΣΗ': '#dc2626',
  'ΥΠΗΡΕΣΙΕΣ': '#7c3aed',
  'ΑΓΡΟΤΙΚΑ': '#65a30d',
  'ΑΛΛΟ': '#6b7280',
}

// 2-digit NACE division -> category
const DIVISION_TO_CATEGORY: Record<string, BusinessCategory> = {
  '55': 'ΤΟΥΡΙΣΜΟΣ', // Καταλύματα
  '79': 'ΤΟΥΡΙΣΜΟΣ', // Ταξιδιωτικά πρακτορεία
  '56': 'ΕΣΤΙΑΣΗ',   // Δραστηριότητες υπηρεσιών εστίασης
  '45': 'ΕΜΠΟΡΙΟ',
  '46': 'ΕΜΠΟΡΙΟ',
  '47': 'ΕΜΠΟΡΙΟ',
  '01': 'ΑΓΡΟΤΙΚΑ', // Φυτική και ζωική παραγωγή
  '02': 'ΑΓΡΟΤΙΚΑ', // Δασοκομία και υλοτομία
  '03': 'ΑΓΡΟΤΙΚΑ', // Αλιεία και υδατοκαλλιέργεια
}

const MANUFACTURING_DIVISIONS = Array.from({ length: 24 }, (_, i) => String(i + 10)) // 10..33

// Special ΑΑΔΕ ΚΑΔ used to flag farmers under the special VAT regime
// ("ΑΓΡΟΤΗΣ ΕΙΔΙΚΟΥ ΚΑΘΕΣΤΩΤΟΣ") — not a real NACE manufacturing division
// even though it starts with "10".
const FARMER_SPECIAL_REGIME_CODE = '1000000'

function isManufacturing(division: number): boolean {
  return division >= 10 && division <= 33
}

// Resolves a category from a business's primary ΚΑΔ code (e.g. "56.10" or "5610").
export function categorizeByKad(firmActCode: string | null | undefined): BusinessCategory {
  if (!firmActCode) return 'ΑΛΛΟ'
  const digits = firmActCode.replace(/\D/g, '')
  if (digits.length < 2) return 'ΑΛΛΟ'
  if (digits.startsWith(FARMER_SPECIAL_REGIME_CODE)) return 'ΑΓΡΟΤΙΚΑ'
  const division2 = digits.slice(0, 2)
  if (DIVISION_TO_CATEGORY[division2]) return DIVISION_TO_CATEGORY[division2]
  const divisionNum = parseInt(division2, 10)
  if (isManufacturing(divisionNum)) return 'ΜΕΤΑΠΟΙΗΣΗ'
  // Sections G(45-47)/I(55-56) handled above; everything else falls back to services.
  return 'ΥΠΗΡΕΣΙΕΣ'
}

// Manual category overrides are stored as a special tag, e.g. "ΚΛΑΔΟΣ:ΤΟΥΡΙΣΜΟΣ",
// so accountants can correct the auto-detected category without a schema change.
export const CATEGORY_TAG_PREFIX = 'ΚΛΑΔΟΣ:'

export function categoryTag(category: BusinessCategory): string {
  return CATEGORY_TAG_PREFIX + category
}

export function getCategoryOverride(tags: string[] | null | undefined): BusinessCategory | null {
  const tag = (tags || []).find(t => t.startsWith(CATEGORY_TAG_PREFIX))
  if (!tag) return null
  const value = tag.slice(CATEGORY_TAG_PREFIX.length)
  return (ALL_CATEGORIES as string[]).includes(value) ? (value as BusinessCategory) : null
}

// Resolves the effective category for a business: a manual override (via tag) wins,
// otherwise it's derived from the primary ΚΑΔ.
export function getEffectiveCategory(business: {
  tags?: string[] | null
  activities?: Array<{ firmActCode?: string | null; firmActKind?: number | null }>
}): BusinessCategory {
  const override = getCategoryOverride(business.tags)
  if (override) return override
  const primary = business.activities?.find(a => a.firmActKind === 1) || business.activities?.[0]
  return categorizeByKad(primary?.firmActCode)
}

// Builds a Prisma `where` fragment matching businesses that fall into the given
// category, accounting for manual tag overrides. Combine multiple categories with OR.
//
// Note: many existing rows have `tags = NULL` rather than `[]`, and Prisma's
// `hasSome`/`has` filters on a NULL array column evaluate to NULL in SQL — which
// makes the whole WHERE clause exclude the row. So we deliberately avoid any
// `NOT`/`hasSome` over `tags` here and just OR the override-tag match with the
// ΚΑΔ-derived match (each branch is independently null-safe).
export function categoryWhereClause(category: BusinessCategory): any {
  const overrideTag = categoryTag(category)

  if (category === 'ΤΟΥΡΙΣΜΟΣ' || category === 'ΕΣΤΙΑΣΗ' || category === 'ΕΜΠΟΡΙΟ' || category === 'ΑΓΡΟΤΙΚΑ' || category === 'ΜΕΤΑΠΟΙΗΣΗ') {
    const divisions = category === 'ΤΟΥΡΙΣΜΟΣ' ? ['55', '79']
      : category === 'ΕΣΤΙΑΣΗ' ? ['56']
      : category === 'ΕΜΠΟΡΙΟ' ? ['45', '46', '47']
      : category === 'ΑΓΡΟΤΙΚΑ' ? ['01', '02', '03']
      : MANUFACTURING_DIVISIONS

    const divisionConditions: any[] = divisions.map(d => ({ firmActCode: { startsWith: d } }))
    if (category === 'ΑΓΡΟΤΙΚΑ') {
      divisionConditions.push({ firmActCode: { startsWith: FARMER_SPECIAL_REGIME_CODE } })
    }

    let activityMatch: any = { firmActKind: 1, OR: divisionConditions }
    if (category === 'ΜΕΤΑΠΟΙΗΣΗ') {
      // Division "10" overlaps with the special farmer-regime code, which belongs to ΑΓΡΟΤΙΚΑ instead.
      activityMatch = { AND: [activityMatch, { NOT: { firmActCode: { startsWith: FARMER_SPECIAL_REGIME_CODE } } }] }
    }

    return {
      OR: [
        { tags: { has: overrideTag } },
        { activities: { some: activityMatch } },
      ],
    }
  }

  const allKnownDivisions = Object.keys(DIVISION_TO_CATEGORY).concat(MANUFACTURING_DIVISIONS)
  if (category === 'ΥΠΗΡΕΣΙΕΣ') {
    return {
      OR: [
        { tags: { has: overrideTag } },
        { activities: { some: { firmActKind: 1, NOT: { OR: allKnownDivisions.map(d => ({ firmActCode: { startsWith: d } })) } } } },
      ],
    }
  }

  // ΑΛΛΟ — no primary ΚΑΔ at all
  return {
    OR: [
      { tags: { has: overrideTag } },
      { activities: { none: { firmActKind: 1 } } },
    ],
  }
}
