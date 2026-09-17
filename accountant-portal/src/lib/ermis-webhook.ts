// Sends the ermis.business_ready / ermis.completed webhook back to Case
// Management. Lives outside the ermis-sessions route (rather than a route
// file importing a route file) so other libs — e.g. matching.ts, which needs
// to notify CM when a program-criteria edit invalidates a match it already
// told CM about — can call it too.
export async function sendErmisWebhook(params: {
  callbackUrl: string
  event: 'ermis.business_ready' | 'ermis.completed' | 'ermis.progress'
  token: string
  leadRef: string | null
  afm: string
  businessProfile: any
  // The program this Ερμής session is about — CM keys leads on ΑΦΜ+program,
  // so two programs for the same ΑΦΜ are two distinct leads.
  program?: string | null
  eligibility?: string | null
  transcript?: any[] | null
  completedAt?: string | null
  // Overrides the default `businessProfile.matchedPrograms` (simple
  // {title,status} list) — used by ermis.business_ready to send the
  // extended multi-program array with per-program chatUrl/token.
  matchedPrograms?: any[]
}) {
  const apiKey = process.env.CASES_API_KEY
  if (!apiKey) {
    console.error(`[ErmisWebhook] ${params.event} NOT sent for ΑΦΜ ${params.afm} — CASES_API_KEY is missing`)
    return
  }
  try {
    const res = await fetch(params.callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({
        event: params.event,
        token: params.token,
        leadRef: params.leadRef,
        afm: params.afm,
        business: params.businessProfile,
        matchedPrograms: params.matchedPrograms ?? params.businessProfile?.matchedPrograms ?? [],
        ...(params.program !== undefined ? { program: params.program } : {}),
        ...(params.eligibility !== undefined ? { eligibility: params.eligibility } : {}),
        ...(params.transcript !== undefined ? { transcript: params.transcript } : {}),
        ...(params.completedAt !== undefined ? { completedAt: params.completedAt } : {}),
      }),
    })
    const bodyText = await res.text().catch(() => '')
    console.log(`[ErmisWebhook] ${params.event} for ΑΦΜ ${params.afm} → ${params.callbackUrl} → HTTP ${res.status}${params.transcript ? ` (transcript: ${params.transcript.length} messages)` : ''} — response: ${bodyText.slice(0, 300)}`)
  } catch (err: any) {
    console.error(`[ErmisWebhook] ${params.event} failed for ΑΦΜ ${params.afm}:`, err?.message)
  }
}
