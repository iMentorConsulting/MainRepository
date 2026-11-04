import { prisma } from './prisma'

export type MessageLogKind = 'QUICK_SEND' | 'ELIGIBILITY' | 'PROGRAM_EMAIL'
export type MessageLogChannel = 'EMAIL' | 'VIBER'

// Unified log for every send OUTSIDE the formal Campaign system (which
// already logs itself via CampaignRecipient) — Quick Send, the combined
// eligibility email/Viber, and the single-program prospect email. Feeds the
// "Όλες οι Αποστολές" view on the Campaigns page. Never throws — a logging
// failure must not break the send it's recording.
export async function logMessage(params: {
  kind: MessageLogKind
  channel: MessageLogChannel
  businessId?: string | null
  businessName?: string | null
  afm?: string | null
  accountantId?: string | null
  accountantName?: string | null
  subject?: string | null
  recipient?: string | null
  success: boolean
  errorMessage?: string | null
  sentByUserId?: string | null
  sentByName?: string | null
}) {
  try {
    await prisma.messageLog.create({ data: params })
  } catch (error: any) {
    console.error('[MessageLog] write failed:', error?.message)
  }
}
