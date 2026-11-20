import { resolveRegionFromZip } from '@/lib/greek-regions'

// Whether the business's registered ΤΚ satisfies a program's geographic rules —
// same semantics as the matching engine (region rule AND ΤΚ-prefix rule, each
// only when set). Shown as an INDICATION next to programs that accept υπό
// ίδρυση businesses: the client may plan to invest somewhere else than their
// registered seat, so it never blocks sending.
export type ZipStatus = 'eligible' | 'not-eligible' | 'no-restriction' | 'unknown'

export function zipStatusForProgram(
  program: { regionRules: string[]; zipCodeRules: string[] },
  zip: string | null | undefined,
): ZipStatus {
  if (program.regionRules.length === 0 && program.zipCodeRules.length === 0) return 'no-restriction'
  const z = (zip || '').replace(/\s/g, '')
  if (!z) return 'unknown'
  if (program.regionRules.length > 0) {
    const region = resolveRegionFromZip(z)
    if (!region || !program.regionRules.includes(region)) return 'not-eligible'
  }
  if (program.zipCodeRules.length > 0 && !program.zipCodeRules.some(r => z.startsWith(r) || z === r)) return 'not-eligible'
  return 'eligible'
}
