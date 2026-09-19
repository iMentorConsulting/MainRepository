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
  return cleanRule.includes('.') ? activityCode === cleanRule : activityCode.startsWith(cleanRule)
}

export interface KadCriterionProgram {
  kadRules: string[]
  excludedKadRules: string[]
  excludedKadExceptions: string[]
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
//   1. is eligible (matches kadRules, or kadRules is "*" — all ΚΑΔ eligible), AND
//   2. is not excluded, OR is excluded but exactly matches an entry in
//      excludedKadExceptions (which cancels only that one exclusion rule).
// A business is never rejected outright for having one excluded/secondary
// ΚΑΔ as long as another of its activity codes clears both steps.
export function evaluateKadCriterion(activityCodes: string[], program: KadCriterionProgram): KadCriterionResult {
  const allKad = program.kadRules.includes('*')
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
