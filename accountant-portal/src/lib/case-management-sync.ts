// Outbound webhook to I-MENTOR's Case Management app: notifies it of a new
// ClientCase (program/grant assignment) so its team gets an alert and can
// manually accept it. Configure via env:
//   CASE_MGMT_WEBHOOK_URL — e.g. https://consult.i-mentor.gr/api/cm/portal-integration/webhook
//   CASES_API_KEY         — shared secret sent as x-api-key (same key used for
//                           the inbound /api/external/cases endpoint)
// If unset, this is a no-op.

function deriveProgramCategory(programTitle: string | null | undefined): string {
  if (!programTitle) return 'ΕΣΠΑ'
  const t = programTitle.toUpperCase()
  if (t.includes('ΤΑΜΕΙΟ ΜΙΚΡΟΠΙΣΤΩΣΕΩΝ') || t.includes('ΜΙΚΡΟΠΙΣΤΩΣ')) return 'ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ'
  if (t.includes('ΔΥΠΑ') || t.includes('ΟΑΕΔ')) return 'ΔΥΠΑ'
  if (t.includes('ΑΝΑΚΑΙΝΙΖ')) return 'ΑΝΑΚΑΙΝΙΖΩ'
  if (t.includes('ΕΣΠΑ')) return 'ΕΣΠΑ'
  return 'ΕΣΠΑ'
}

// Returns the CM lead reference ID if CM sends one back in the response body,
// or null if missing/unavailable. Callers that need to store this should await.
export async function notifyCaseManagement(data: {
  caseNumber: number
  afm: string
  onomasia: string | null
  phone?: string | null
  email?: string | null
  accountantOffice: string | null
  caseType: string | null
  description: string | null
  priority: string
  programTitle?: string | null
  // Echoed back when this case was opened in response to an inbound
  // assignment-request from Case Management (see /api/external/assignment-requests),
  // so Case Management can correlate this notification to its own request.
  requestRef?: string | null
  // True when the Ερμής screening ALREADY happened before this case was
  // created (GEMI prospect flow) — CM must NOT auto-start a new Ερμής
  // session/Viber for it; the transcript arrives via the ermis.completed
  // webhook for the same ΑΦΜ.
  ermis_completed?: boolean
  // The exact program title in Logistis (in addition to the coarse
  // program_category) so CM can reference the real program.
  program_exact_title?: string | null
  // Full AADE-derived business profile (see lib/business-profile.ts) — sourced
  // entirely from Logistis's own cached Business/activities data, never a fresh
  // AADE call at notify time (repeated lookups for the same ΑΦΜ are avoided
  // deliberately). Spread in by every call site via buildBusinessProfilePayload().
  commercialTitle?: string | null
  legalStatusDescr?: string | null
  regdate?: string | null
  doy?: string | null
  doyDescr?: string | null
  postalAddress?: string | null
  postalAddressNo?: string | null
  postalZipCode?: string | null
  postalAreaDescription?: string | null
  perifereia?: string | null
  klados?: string | null
  activities?: { firmActCode: string; firmActDescr: string | null; firmActKind: string | null }[]
  matchedPrograms?: { title: string; status: string }[]
}): Promise<string | null> {
  const url = process.env.CASE_MGMT_WEBHOOK_URL
  const apiKey = process.env.CASES_API_KEY
  if (!url || !apiKey) return null

  const program_category = deriveProgramCategory(data.programTitle)

  try {
    console.log(`[CaseManagement] Sending case.created for case #${data.caseNumber} to ${url}`)
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ event: 'case.created', ...data, program_category }),
    })
    const responseText = await res.text().catch(() => '')
    if (!res.ok) {
      console.error(`[CaseManagement] Webhook failed for case #${data.caseNumber}: HTTP ${res.status} ${responseText}`)
      return null
    }
    // Try to extract the CM lead ID from the response so callers can store it as externalRef
    let cmLeadRef: string | null = null
    try {
      const responseBody = JSON.parse(responseText)
      const raw = responseBody?.leadRef ?? responseBody?.leadId ?? responseBody?.id ?? responseBody?.ref ?? null
      if (raw) cmLeadRef = String(raw)
    } catch { /* non-JSON response, ignore */ }
    console.log(`[CaseManagement] Webhook OK for case #${data.caseNumber}: HTTP ${res.status}${cmLeadRef ? ` cmLeadRef=${cmLeadRef}` : ''}`)
    return cmLeadRef
  } catch (err: any) {
    console.error(`[CaseManagement] Webhook error for case #${data.caseNumber}:`, err?.message || err)
    return null
  }
}

// Pushes a document uploaded in the portal (accountant-portal/api/cases/[id]/documents)
// to the inhouse Case Management app's documents section for the same case, so the
// accountant doesn't have to upload it twice. Same env vars/auth as notifyCaseManagement;
// no-op if unset or if the case was never linked to a Case Management case (externalRef).
// Returns true only on a confirmed successful delivery — callers use this to decide
// whether to mark the document as synced or leave it queued for retry once the case
// is linked (see externalRef note above; a doc sent with no externalRef has nothing
// for Case Management to attach it to and must be treated as not delivered).
export async function notifyCaseManagementDocument(data: {
  caseNumber: number
  externalRef?: string | null
  afm: string
  onomasia: string | null
  category: string
  fileName: string
  dataUrl: string
  uploadedByName: string
  uploadedByRole: string
}): Promise<boolean> {
  const url = process.env.CASE_MGMT_WEBHOOK_URL
  const apiKey = process.env.CASES_API_KEY
  if (!url || !apiKey) return false
  if (!data.externalRef) return false

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ event: 'document.uploaded', ...data }),
    })
    if (!res.ok) {
      console.error(`[CaseManagement] Document webhook failed for case ${data.caseNumber}: HTTP ${res.status}`)
      return false
    }
    return true
  } catch (err: any) {
    console.error(`[CaseManagement] Document webhook error for case ${data.caseNumber}:`, err?.message || err)
    return false
  }
}
