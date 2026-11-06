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
  // Full Ερμής conversation transcript, appended to description before sending.
  ermis_transcript?: string
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
  const descriptionWithTranscript = data.ermis_transcript
    ? `${data.description || ''}\n\n--- ΠΛΗΡΗΣ ΣΥΝΟΜΙΛΙΑ ΕΡΜΗ ---\n${data.ermis_transcript}`.trim()
    : data.description

  try {
    console.log(`[CaseManagement] Sending case.created for case #${data.caseNumber} to ${url}`)
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ event: 'case.created', ...data, description: descriptionWithTranscript, program_category }),
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

// The exact 7 status strings Case Management's own lead-status dropdown
// uses, sent byte-for-byte as the literal value to set on the lead — no
// mapping/translation on either side. Never add a value that isn't one of
// these 7 (CM only recognizes these), and never rename one.
export type CmLeadStatus = 'NEW LEAD' | 'WORKED' | 'CALL' | 'HOT' | 'ACTIVE' | 'DEAL' | 'CANCEL'

// Fired every time a consultant sends one of the client-facing emails from a
// business's program match (program-info email, microcredits eligibility
// analysis, "Ενημέρωση & Επόμενα Βήματα" advisory email) with "Ενημέρωση
// Case Management" left checked. CM is expected to:
//   1. Find the lead matching this ΑΦΜ + program (program_category/
//      program_exact_title, same fields as case.created) — the most recent
//      non-cancelled one if several exist for the same client.
//   2. Append `comment` as a new note/activity on that lead.
//   3. If `leadStatus` is present, update the lead's status to match.
//   4. If `reminderDate` is present (YYYY-MM-DD), set/replace the lead's
//      follow-up/reminder date.
// If no matching lead exists, CM should no-op (or create one — its call) and
// may optionally reply { found: boolean } so Logistis can surface that back
// to the consultant; a response with no `found` field is treated as unknown
// (assume delivered, don't warn). Same env/auth as notifyCaseManagement;
// no-op (returns {delivered:false}) if unset.
export async function notifyCaseManagementCommunication(data: {
  afm: string
  onomasia?: string | null
  programTitle?: string | null
  kind: string // ADVICE | PROGRAM_EMAIL | MICROCREDITS
  channel: 'EMAIL' | 'VIBER'
  subject?: string | null
  comment: string
  leadStatus?: CmLeadStatus | null
  reminderDate?: string | null
  sentByName?: string | null
}): Promise<{ delivered: boolean; found?: boolean }> {
  const url = process.env.CASE_MGMT_WEBHOOK_URL
  const apiKey = process.env.CASES_API_KEY
  if (!url || !apiKey) return { delivered: false }

  const program_category = deriveProgramCategory(data.programTitle)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({
        event: 'communication.logged',
        afm: data.afm,
        onomasia: data.onomasia ?? null,
        programTitle: data.programTitle ?? null,
        program_category,
        kind: data.kind,
        channel: data.channel,
        subject: data.subject ?? null,
        comment: data.comment,
        leadStatus: data.leadStatus ?? null,
        reminderDate: data.reminderDate ?? null,
        sentByName: data.sentByName ?? null,
        loggedAt: new Date().toISOString(),
      }),
    })
    const responseText = await res.text().catch(() => '')
    if (!res.ok) {
      console.error(`[CaseManagement] communication.logged failed for ΑΦΜ ${data.afm}: HTTP ${res.status} ${responseText}`)
      return { delivered: false }
    }
    let found: boolean | undefined
    try {
      const body = JSON.parse(responseText)
      if (typeof body?.found === 'boolean') found = body.found
    } catch { /* non-JSON response, ignore */ }
    console.log(`[CaseManagement] communication.logged OK for ΑΦΜ ${data.afm}${found === false ? ' (no matching lead found)' : ''}`)
    return { delivered: true, found }
  } catch (err: any) {
    console.error(`[CaseManagement] communication.logged error for ΑΦΜ ${data.afm}:`, err?.message || err)
    return { delivered: false }
  }
}
