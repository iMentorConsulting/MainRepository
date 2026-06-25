// Claude Sonnet 4.6 pricing (the model used in ermis-agent.ts).
const USD_PER_MILLION_INPUT = 3
const USD_PER_MILLION_OUTPUT = 15
const USD_TO_EUR = 0.92

// Exact cost when we know the input/output split (stored as
// tokenUsageInput/tokenUsageOutput since both fields were added) — each
// priced at its own rate. Falls back to a blended-rate guess for older rows
// that only have a combined tokenUsage total (note: rows from before the
// Opus 4.8 -> Sonnet 4.6 switch will look slightly cheaper here than they
// actually were).
export function estimateCostEur(tokens: number, inputTokens?: number, outputTokens?: number): string {
  let usd: number
  if (inputTokens || outputTokens) {
    usd = ((inputTokens || 0) / 1_000_000) * USD_PER_MILLION_INPUT + ((outputTokens || 0) / 1_000_000) * USD_PER_MILLION_OUTPUT
  } else {
    // Rough fallback blend for legacy rows without a stored split.
    usd = (tokens / 1_000_000) * 10
  }
  const eur = usd * USD_TO_EUR
  return `~${eur < 0.01 && eur > 0 ? eur.toFixed(4) : eur.toFixed(2)}€`
}
