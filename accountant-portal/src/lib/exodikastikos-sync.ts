import { prisma } from './prisma'
import { decrypt } from './crypto'

// Outbound sync: push a newly-created Εξωδικαστικός referral to I-MENTOR's
// dedicated εξωδικαστικός case-management application, so its team can pick
// it up and start the 15-day debt assessment. Configure via env:
//   EXODIKASTIKOS_API_URL  — base URL of the inhouse εξωδικαστικός app
//   EXODIKASTIKOS_API_KEY  — shared secret sent as x-api-key
// If unset, this is a no-op (the case stays SUBMITTED until manually handled).
export async function pushExodikastikosCase(caseId: string) {
  const apiUrl = process.env.EXODIKASTIKOS_API_URL
  const apiKey = process.env.EXODIKASTIKOS_API_KEY
  if (!apiUrl || !apiKey) return

  const item = await prisma.exodikastikosCase.findUnique({
    where: { id: caseId },
    include: {
      business: { select: { afm: true, onomasia: true, clientType: true, email: true, phone: true } },
      accountant: { select: { officeName: true, email: true } },
    },
  })
  if (!item) return

  const payload = {
    caseNumber: item.caseNumber,
    afm: item.business.afm,
    onomasia: item.business.onomasia,
    clientType: item.business.clientType,
    email: item.business.email,
    phone: item.business.phone,
    accountantOffice: item.accountant?.officeName || null,
    questionnaire: item.questionnaire,
    notes: item.notes,
    hasSpouse: item.hasSpouse,
    taxisnetUsername: item.taxisnetUsernameEnc ? decrypt(item.taxisnetUsernameEnc) : null,
    taxisnetPassword: item.taxisnetPasswordEnc ? decrypt(item.taxisnetPasswordEnc) : null,
    spouseTaxisnetUsername: item.spouseTaxisnetUsernameEnc ? decrypt(item.spouseTaxisnetUsernameEnc) : null,
    spouseTaxisnetPassword: item.spouseTaxisnetPasswordEnc ? decrypt(item.spouseTaxisnetPasswordEnc) : null,
    callbackRef: item.id,
  }

  try {
    const res = await fetch(`${apiUrl.replace(/\/$/, '')}/cases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      console.error(`[Exodikastikos] Push failed for case ${item.caseNumber}: HTTP ${res.status}`)
      return
    }
    const data = await res.json().catch(() => ({}))
    if (data.externalRef) {
      await prisma.exodikastikosCase.update({
        where: { id: item.id },
        data: { externalRef: String(data.externalRef), externalSyncedAt: new Date() },
      })
    }
  } catch (err: any) {
    console.error(`[Exodikastikos] Push error for case ${item.caseNumber}:`, err?.message || err)
  }
}
