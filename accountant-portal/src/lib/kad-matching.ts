// Shared ΚΑΔ (Greek business-activity code) eligibility logic used by both
// matching engines — matching.ts (normal Business records) and
// gemi-matching.ts (GEMI-sourced businesses) — so the two never drift apart.
//
// Adds "exclusion exceptions": a program can exclude a whole prefix (e.g.
// "01" — all of γεωργία/κτηνοτροφία) while still allowing specific full
// ΚΑΔ codes within that excluded prefix (e.g. "01630104"). This does NOT
// make a business eligible by itself — it only cancels ONE exclusion rule
// for that one activity code; every other program criterion still applies
// exactly as before.

// Preserves the exact pre-existing padding behavior used throughout the
// eligible/excluded-list matching (kadRules/excludedKadRules): AADE's
// webservice sometimes drops the leading zero on categories 01-09 (e.g.
// "3112100" instead of "03112100") — pad 7-digit codes back to 8. Rules
// that contain dots are NOT touched here (kept byte-for-byte identical to
// the original implementation) so already-configured programs keep behaving
// exactly as they do today.
function normalizeKadLegacy(code: string): string {
  return /^\d{7}$/.test(code) ? '0' + code : code
}

// Canonical normalization for the NEW exclusion-exception list (and for
// comparing a business activity code against it): strip dots/spaces/any
// non-digit character, then apply the same 7→8 digit leading-zero fix. Used
// wherever a robust, punctuation-proof comparison is needed — never for the
// legacy kadRules/excludedKadRules dot-vs-prefix matching, which must stay
// unchanged for backward compatibility.
export function normalizeKadForComparison(raw: string): string {
  const digitsOnly = (raw || '').replace(/\D/g, '')
  return digitsOnly.length === 7 ? '0' + digitsOnly : digitsOnly
}

// Original eligible/excluded-list matching semantics, extracted verbatim:
// a rule containing a dot is compared by exact equality (after the legacy
// normalization); a plain rule is treated as a prefix.
function ruleMatches(activityCode: string, rule: string): boolean {
  const cleanRule = normalizeKadLegacy(rule.trim())
  if (cleanRule.includes('.')) return activityCode === cleanRule

  if (activityCode.startsWith(cleanRule)) return true

  // AADE drops the leading zero for sector 01-09 ΚΑΔ codes it returns
  // (normalizeKadLegacy restores it, but only for a FULL, exactly-7-digit
  // code — see its comment). Admins sometimes enter SHORT prefix rules
  // copy-pasted from an official list published in that same abbreviated
  // form — e.g. "12611" meaning the sector-01 prefix "01.26.11", not a
  // literal sector-12 prefix. A padded business activity code only ever
  // starts with "0" for sectors 01-09 (see normalizeKadLegacy), so trying
  // this extra candidate is safe: it can never accidentally match a real
  // sector-10-and-up business — only a genuinely zero-dropped rule.
  if (!cleanRule.startsWith('0') && cleanRule.length < 8) {
    return activityCode.startsWith('0' + cleanRule)
  }

  return false
}

export interface KadCriterionProgram {
  kadRules: string[]
  excludedKadRules: string[]
  excludedKadExceptions: string[]
}

// Whether the ΚΑΔ criterion should be evaluated at all for this program.
// It's active if there's an eligible-ΚΑΔ list OR an exclusion list — a
// program that only configures excludedKadRules (no kadRules) still
// enforces that exclusion; it must not be silently skipped just because
// the eligible-ΚΑΔ list was left empty.
export function hasActiveKadCriterion(program: KadCriterionProgram): boolean {
  return program.kadRules.length > 0 || program.excludedKadRules.length > 0 || program.excludedKadExceptions.length > 0
}

export interface KadCriterionResult {
  pass: boolean
  // The business's own (un-normalized) activity code that satisfied the
  // criterion, for building a human-readable match reason.
  matchedCode: string | null
  // True only when `pass` is true SOLELY because an exclusion was
  // overridden by an exception — useful for diagnostics/logging.
  matchedViaException: boolean
}

// A business passes the ΚΑΔ criterion if AT LEAST ONE of its activity codes:
//   1. is eligible (matches kadRules; kadRules is "*"; or kadRules is EMPTY
//      — an empty eligible-ΚΑΔ list means "no restriction from this side",
//      same convention as every other empty rule list in this app, e.g.
//      regionRules/zipCodeRules), AND
//   2. is not excluded, OR is excluded but exactly matches an entry in
//      excludedKadExceptions (which cancels only that one exclusion rule).
// Exclusions apply independently of whether an eligible list is configured
// — a program that only sets excludedKadRules (no kadRules) still excludes
// those codes, it does not silently skip ΚΑΔ checking altogether.
// A business is never rejected outright for having one excluded/secondary
// ΚΑΔ as long as another of its activity codes clears both steps.
export function evaluateKadCriterion(activityCodes: string[], program: KadCriterionProgram): KadCriterionResult {
  const allKad = program.kadRules.length === 0 || program.kadRules.includes('*')
  const exceptionCodes = program.excludedKadExceptions.map(normalizeKadForComparison)

  for (const rawCode of activityCodes) {
    const activityCode = normalizeKadLegacy(rawCode)

    const eligibleBase = allKad || program.kadRules.some(rule => ruleMatches(activityCode, rule))
    if (!eligibleBase) continue

    const excludedMatch = program.excludedKadRules.some(rule => ruleMatches(activityCode, rule))
    if (!excludedMatch) {
      return { pass: true, matchedCode: rawCode, matchedViaException: false }
    }

    const isException = exceptionCodes.includes(normalizeKadForComparison(activityCode))
    if (isException) {
      return { pass: true, matchedCode: rawCode, matchedViaException: true }
    }
    // Excluded and not exempted — try the business's next activity code.
  }

  return { pass: false, matchedCode: null, matchedViaException: false }
}
