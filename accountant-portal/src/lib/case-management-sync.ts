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
