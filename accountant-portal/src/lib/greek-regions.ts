// The 13 official Greek administrative regions ("Περιφέρειες").
export const GREEK_REGIONS = [
  'Αττική',
  'Κεντρική Μακεδονία',
  'Θεσσαλία',
  'Ανατολική Μακεδονία και Θράκη',
  'Ήπειρος',
  'Δυτική Μακεδονία',
  'Ιόνια Νησιά',
  'Δυτική Ελλάδα',
  'Στερεά Ελλάδα',
  'Πελοπόννησος',
  'Βόρειο Αιγαίο',
  'Νότιο Αιγαίο',
  'Κρήτη',
] as const

export type GreekRegion = typeof GREEK_REGIONS[number]

// Greek postal codes (ΤΚ) are allocated in contiguous ranges per
// prefecture/region. This maps each 2-digit ΤΚ prefix to the region it
// predominantly belongs to — an approximation that covers the vast
// majority of addresses without requiring an external geocoding service.
// Edge cases at range boundaries may occasionally be imprecise.
const ZIP_PREFIX_TO_REGION: Record<string, GreekRegion> = {
  '10': 'Αττική', '11': 'Αττική', '12': 'Αττική', '13': 'Αττική',
  '14': 'Αττική', '15': 'Αττική', '16': 'Αττική', '17': 'Αττική',
  '18': 'Αττική', '19': 'Αττική',
  '20': 'Πελοπόννησος', '21': 'Πελοπόννησος', '22': 'Πελοπόννησος',
  '23': 'Πελοπόννησος', '24': 'Πελοπόννησος',
  '25': 'Δυτική Ελλάδα', '26': 'Δυτική Ελλάδα', '27': 'Δυτική Ελλάδα',
  '28': 'Ιόνια Νησιά', '29': 'Ιόνια Νησιά',
  '30': 'Στερεά Ελλάδα', '31': 'Στερεά Ελλάδα', '32': 'Στερεά Ελλάδα', '33': 'Στερεά Ελλάδα',
  '34': 'Στερεά Ελλάδα', '35': 'Στερεά Ελλάδα', '36': 'Στερεά Ελλάδα',
  '37': 'Θεσσαλία', '38': 'Θεσσαλία', '39': 'Θεσσαλία', '40': 'Θεσσαλία', '41': 'Θεσσαλία',
  '42': 'Θεσσαλία', '43': 'Θεσσαλία',
  '44': 'Ήπειρος', '45': 'Ήπειρος', '46': 'Ήπειρος', '47': 'Ήπειρος', '48': 'Ήπειρος',
  '49': 'Ιόνια Νησιά',
  '50': 'Δυτική Μακεδονία', '51': 'Δυτική Μακεδονία',
  '52': 'Δυτική Μακεδονία', '53': 'Δυτική Μακεδονία',
  '54': 'Κεντρική Μακεδονία', '55': 'Κεντρική Μακεδονία', '56': 'Κεντρική Μακεδονία',
  '57': 'Κεντρική Μακεδονία', '58': 'Κεντρική Μακεδονία', '59': 'Κεντρική Μακεδονία',
  '60': 'Κεντρική Μακεδονία', '61': 'Κεντρική Μακεδονία', '62': 'Κεντρική Μακεδονία', '63': 'Κεντρική Μακεδονία',
  '64': 'Ανατολική Μακεδονία και Θράκη',
  '65': 'Ανατολική Μακεδονία και Θράκη', '66': 'Ανατολική Μακεδονία και Θράκη',
  '67': 'Ανατολική Μακεδονία και Θράκη', '68': 'Ανατολική Μακεδονία και Θράκη',
  '69': 'Ανατολική Μακεδονία και Θράκη',
  '70': 'Κρήτη', '71': 'Κρήτη', '72': 'Κρήτη', '73': 'Κρήτη', '74': 'Κρήτη',
  '81': 'Βόρειο Αιγαίο', '82': 'Βόρειο Αιγαίο', '83': 'Βόρειο Αιγαίο',
  '84': 'Νότιο Αιγαίο', '85': 'Νότιο Αιγαίο',
}

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

// Distinguishing keyword stems per region, matched against diacritic-stripped
// text — robust to case endings ("Ανατολικής Μακεδονίας") and "&" vs "και".
const REGION_KEYWORD_STEMS: Record<GreekRegion, string[]> = {
  'Αττική': ['αττικ'],
  'Κεντρική Μακεδονία': ['κεντρικ.*μακεδον'],
  'Θεσσαλία': ['θεσσαλ(?!ονικ)'],
  'Ανατολική Μακεδονία και Θράκη': ['μακεδον.*θρακ', 'θρακ.*μακεδον'],
  'Ήπειρος': ['ηπειρ'],
  'Δυτική Μακεδονία': ['δυτικ.*μακεδον'],
  'Ιόνια Νησιά': ['ιονι'],
  'Δυτική Ελλάδα': ['δυτικ.*ελλαδ'],
  'Στερεά Ελλάδα': ['στερε'],
  'Πελοπόννησος': ['πελοποννησ'],
  'Βόρειο Αιγαίο': ['βορει.*αιγαι'],
  'Νότιο Αιγαίο': ['νοτι.*αιγαι'],
  'Κρήτη': ['κρητ'],
}

// Scans free-form text (e.g. a DYPA announcement title/description) for
// mentions of Greek regions, so a converted Program can be prefilled with
// the right regionRules instead of defaulting to nationwide eligibility.
export function detectRegionsInText(text: string): GreekRegion[] {
  const normalized = stripDiacritics(text)
  const found: GreekRegion[] = []
  for (const region of GREEK_REGIONS) {
    const stems = REGION_KEYWORD_STEMS[region]
    if (stems.some(stem => new RegExp(stem).test(normalized))) {
      found.push(region)
    }
  }
  return found
}

// Resolves a business's Greek region from its postal code (ΤΚ).
// Returns null when the ΤΚ is missing/malformed or has no known mapping.
export function resolveRegionFromZip(zip: string | null | undefined): GreekRegion | null {
  if (!zip) return null
  const prefix = zip.trim().slice(0, 2)
  return ZIP_PREFIX_TO_REGION[prefix] || null
}

// Reverse lookup: which ΤΚ prefixes (2-digit) map to a given region —
// used to show admins exactly which postal codes a region selection covers.
export function zipPrefixesForRegion(region: GreekRegion): string[] {
  return Object.entries(ZIP_PREFIX_TO_REGION)
    .filter(([, r]) => r === region)
    .map(([prefix]) => prefix)
    .sort()
}

// Builds a Prisma `where` fragment matching businesses whose postal ZIP resolves
// to the given region (or "Άγνωστη" for ZIPs with no known mapping). Combine
// multiple regions with OR.
export function regionWhereClause(region: string): any {
  if (region === 'Άγνωστη') {
    const allPrefixes = Object.keys(ZIP_PREFIX_TO_REGION)
    return {
      OR: [
        { postalZipCode: null },
        { AND: allPrefixes.map(p => ({ NOT: { postalZipCode: { startsWith: p } } })) },
      ],
    }
  }
  const prefixes = zipPrefixesForRegion(region as GreekRegion)
  return { OR: prefixes.map(p => ({ postalZipCode: { startsWith: p } })) }
}
