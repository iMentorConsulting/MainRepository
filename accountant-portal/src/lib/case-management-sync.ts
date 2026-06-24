// Outbound webhook to I-MENTOR's Case Management app: notifies it of a new
// ClientCase (program/grant assignment) so its team gets an alert and can
// manually accept it. Configure via env:
//   CASE_MGMT_WEBHOOK_URL — e.g. https://consult.i-mentor.gr/api/cm/portal-integration/webhook
//   CASES_API_KEY         — shared secret sent as x-api-key (same key used for
//                           the inbound /api/external/cases endpoint)
// If unset, this is a no-op.

// Outbound request to Case Management asking it to look up a prospect by
// email and open/assign a case for them — used when a consultant wants to
// follow up on a campaign reply but the prospect isn't a ClientCase on our
// side yet. Case Management looks the client up, and once it creates a case
// it echoes `requestRef` back via the existing case.created webhook
// (POST /api/external/cases), which is how we correlate the eventual case
// back to this request. Configure via env:
//   CASE_MGMT_ASSIGNMENT_REQUEST_URL — Case Management's endpoint for this
//   CASES_API_KEY                    — same shared secret as above
export async function requestNewAssignment(data: {
  requestRef: string
  email: string
  programTitle?: string | null
  requestedBy: string
  note?: string | null
}): Promise<{ ok: boolean; error?: string }> {
  const url = process.env.CASE_MGMT_ASSIGNMENT_REQUEST_URL
  const apiKey = process.env.CASES_API_KEY
  if (!url || !apiKey) return { ok: false, error: 'Case Management assignment-request integration not configured' }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      console.error(`[CaseManagement] Assignment request failed for ${data.requestRef}: HTTP ${res.status}`)
      return { ok: false, error: `HTTP ${res.status}` }
    }
    return { ok: true }
  } catch (err: any) {
    console.error(`[CaseManagement] Assignment request error for ${data.requestRef}:`, err?.message || err)
    return { ok: false, error: err?.message || 'network error' }
  }
}

function deriveProgramCategory(programTitle: string | null | undefined): string {
  if (!programTitle) return 'ΕΣΠΑ'
  const t = programTitle.toUpperCase()
  if (t.includes('ΤΑΜΕΙΟ ΜΙΚΡΟΠΙΣΤΩΣΕΩΝ') || t.includes('ΜΙΚΡΟΠΙΣΤΩΣ')) return 'ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ'
  if (t.includes('ΔΥΠΑ') || t.includes('ΟΑΕΔ')) return 'ΔΥΠΑ'
  if (t.includes('ΑΝΑΚΑΙΝΙΖ')) return 'ΑΝΑΚΑΙΝΙΖΩ'
  if (t.includes('ΕΣΠΑ')) return 'ΕΣΠΑ'
  return 'ΕΣΠΑ'
}

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
}) {
  const url = process.env.CASE_MGMT_WEBHOOK_URL
  const apiKey = process.env.CASES_API_KEY
  if (!url || !apiKey) return

  const program_category = deriveProgramCategory(data.programTitle)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ event: 'case.created', ...data, program_category }),
    })
    if (!res.ok) {
      console.error(`[CaseManagement] Webhook failed for case ${data.caseNumber}: HTTP ${res.status}`)
    }
  } catch (err: any) {
    console.error(`[CaseManagement] Webhook error for case ${data.caseNumber}:`, err?.message || err)
  }
}

// Pushes a document uploaded in the portal (accountant-portal/api/cases/[id]/documents)
// to the inhouse Case Management app's documents section for the same case, so the
// accountant doesn't have to upload it twice. Same env vars/auth as notifyCaseManagement;
// no-op if unset or if the case was never linked to a Case Management case (externalRef).
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
}) {
  const url = process.env.CASE_MGMT_WEBHOOK_URL
  const apiKey = process.env.CASES_API_KEY
  if (!url || !apiKey) return

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ event: 'document.uploaded', ...data }),
    })
    if (!res.ok) {
      console.error(`[CaseManagement] Document webhook failed for case ${data.caseNumber}: HTTP ${res.status}`)
    }
  } catch (err: any) {
    console.error(`[CaseManagement] Document webhook error for case ${data.caseNumber}:`, err?.message || err)
  }
}
