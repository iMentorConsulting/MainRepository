// Standalone unit tests for the ΚΑΔ exclusion-exception logic
// (src/lib/kad-matching.ts). No DB/network access needed — pure functions.
// Run with: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/test-kad-matching.ts
import { evaluateKadCriterion, normalizeKadForComparison, hasActiveKadCriterion } from '../src/lib/kad-matching'

let failures = 0

function assert(condition: boolean, message: string) {
  if (!condition) {
    failures++
    console.error(`✗ FAIL: ${message}`)
  } else {
    console.log(`✓ ${message}`)
  }
}

// LEADER-style program from the spec: excludes all of 01 (γεωργία) and 03
// (αλιεία), except for a handful of exact ΚΑΔ within 01 (aquaculture-adjacent
// processing codes that shouldn't have been swept up by the 01 exclusion).
const leaderProgram = {
  kadRules: ['*'],
  excludedKadRules: ['01', '03'],
  excludedKadExceptions: [
    '1630103', '1630104', '1630105', '1630106', '1630107', '1630108', '1630109',
    '1630111', '1630112', '1630113', '1630114', '1630115', '1630116', '1630117',
  ],
}

// 1. 01471101 → excluded because of 01, no exception covers it
assert(
  evaluateKadCriterion(['01471101'], leaderProgram).pass === false,
  '01471101 is rejected by the 01 exclusion (not in the exception list)'
)

// 2. A 03-prefixed code → excluded because of 03
assert(
  evaluateKadCriterion(['03100000'], leaderProgram).pass === false,
  '03100000 is rejected by the 03 exclusion'
)

// 3. 01630104 → allowed via exact exception match
{
  const result = evaluateKadCriterion(['01630104'], leaderProgram)
  assert(result.pass === true, '01630104 passes via the exclusion exception')
  assert(result.matchedViaException === true, '01630104 is flagged as matched via exception')
}

// Also accept the 7-digit form without the leading zero (AADE sometimes
// drops it) — canonical normalization must still line it up with the
// 8-digit exception entry.
{
  const result = evaluateKadCriterion(['1630104'], leaderProgram)
  assert(result.pass === true, '1630104 (7-digit, no leading zero) still passes via the exception')
}

// 4. A non-01/03 ΚΑΔ continues through the normal eligible-KAD check
// (kadRules is "*" here, so anything not excluded passes).
assert(
  evaluateKadCriterion(['47111001'], leaderProgram).pass === true,
  'A non-01/03 ΚΑΔ (47111001) passes the normal eligible check'
)

// 5. Program WITHOUT any exception list behaves exactly as before — an
// excluded prefix has no escape hatch.
const noExceptionProgram = {
  kadRules: ['*'],
  excludedKadRules: ['01', '03'],
  excludedKadExceptions: [],
}
assert(
  evaluateKadCriterion(['01630104'], noExceptionProgram).pass === false,
  'Without an exception list, 01630104 is rejected exactly like before (backward compatible)'
)

// 6. A business with one excluded ΚΑΔ and one eligible ΚΑΔ still passes the
// criterion overall — must not reject the whole business for one bad code.
{
  const result = evaluateKadCriterion(['01471101', '47111001'], leaderProgram)
  assert(result.pass === true, 'Business with one excluded + one eligible ΚΑΔ passes via the eligible one')
  assert(result.matchedCode === '47111001', 'The eligible ΚΑΔ (47111001) is reported as the match, not the excluded one')
}

// Specific (non-"*") eligible-KAD list still combines correctly with
// exclusions + exceptions — an exception doesn't bypass the eligible-list
// check, only the exclusion check.
{
  const restrictedProgram = {
    kadRules: ['0163'], // only 0163* is eligible at all
    excludedKadRules: ['01'],
    excludedKadExceptions: ['1630104'],
  }
  const inEligibleList = evaluateKadCriterion(['01630104'], restrictedProgram)
  assert(inEligibleList.pass === true, '01630104 passes: in eligible list 0163*, excluded by 01, exempted by exception')

  const outsideEligibleList = evaluateKadCriterion(['01630104'], { ...restrictedProgram, kadRules: ['0299'] })
  assert(
    outsideEligibleList.pass === false,
    '01630104 still fails when it is not in the eligible-KAD list at all, even though it is an exclusion exception'
  )
}

// normalizeKadForComparison: strips dots/spaces, preserves leading-zero semantics.
assert(normalizeKadForComparison('16.30.104') === '01630104', 'normalizeKadForComparison strips dots and pads to 8 digits')
assert(normalizeKadForComparison(' 1630104 ') === '01630104', 'normalizeKadForComparison strips spaces and pads to 8 digits')
assert(normalizeKadForComparison('01') === '01', 'normalizeKadForComparison leaves short prefixes (e.g. "01") untouched')
assert(normalizeKadForComparison('01630104') === '01630104', 'normalizeKadForComparison is a no-op on an already-canonical 8-digit code')

// Real bug reproduction: a program with excludedKadRules configured but NO
// eligible-ΚΑΔ list (kadRules left empty, "Όλοι οι ΚΑΔ επιλέξιμοι" unchecked)
// must still enforce the exclusion — it must not silently skip ΚΑΔ checking
// just because the eligible list is empty.
{
  const emptyEligibleProgram = {
    kadRules: [],
    excludedKadRules: ['01', '03'],
    excludedKadExceptions: ['1630103', '1630104'],
  }
  assert(hasActiveKadCriterion(emptyEligibleProgram) === true, 'A program with only excludedKadRules (empty kadRules) has an active ΚΑΔ criterion')
  assert(
    evaluateKadCriterion(['1471101'], emptyEligibleProgram).pass === false,
    'ΚΑΔ 1471101 (poultry farming, under excluded prefix 01) is rejected even when kadRules is empty'
  )
  assert(
    evaluateKadCriterion(['1630104'], emptyEligibleProgram).pass === true,
    'ΚΑΔ 1630104 still passes via the exception even when kadRules is empty'
  )
  assert(
    evaluateKadCriterion(['47111001'], emptyEligibleProgram).pass === true,
    'A non-excluded ΚΑΔ passes when kadRules is empty (empty eligible list = no restriction from that side)'
  )

  const noKadCriteriaAtAll = { kadRules: [], excludedKadRules: [], excludedKadExceptions: [] }
  assert(hasActiveKadCriterion(noKadCriteriaAtAll) === false, 'A program with no ΚΑΔ configuration at all has no active ΚΑΔ criterion (unchanged)')
}

// Real bug reproduction: a short excludedKadRules prefix copy-pasted from an
// official list in AADE's zero-dropped shorthand (e.g. "12611" meaning
// sector-01 prefix "01.26.11") must still exclude the matching business —
// ΣΤΕΦΑΝΗ ΣΤΑΥΡΟΥΛΑ, ΚΑΔ 1261100 (ΚΑΛΛΙΕΡΓΕΙΑ ΕΠΙΤΡΑΠΕΖΙΩΝ ΕΛΙΩΝ, official
// code 01.26.11.00), should have been rejected by an excluded-ΚΑΔ rule
// "12611" but wasn't, because the rule was compared literally against the
// zero-padded business code ("01261100") without restoring ITS leading zero.
{
  const dypaProgram = {
    kadRules: ['*'],
    excludedKadRules: ['11111', '12611', '1112001'],
    excludedKadExceptions: [],
  }
  assert(
    evaluateKadCriterion(['1261100'], dypaProgram).pass === false,
    'ΚΑΔ 1261100 is rejected by the short excluded-ΚΑΔ prefix "12611" (zero-dropped sector 01)'
  )
  assert(
    evaluateKadCriterion(['01261100'], dypaProgram).pass === false,
    'The same exclusion works when the business code already has its leading zero'
  )
  // A legit non-01/03 short prefix rule must still behave normally and must
  // NOT be affected by the zero-padding fallback.
  const retailProgram = { kadRules: ['*'], excludedKadRules: ['47'], excludedKadExceptions: [] }
  assert(
    evaluateKadCriterion(['47111001'], retailProgram).pass === false,
    'A genuine 2-digit sector exclusion ("47", retail trade) still works unaffected'
  )
  assert(
    evaluateKadCriterion(['10110000'], retailProgram).pass === true,
    'A business outside the "47" exclusion still passes (no false positive from the zero-padding fallback)'
  )
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`)
  process.exit(1)
} else {
  console.log('\nAll ΚΑΔ exclusion-exception tests passed.')
}
