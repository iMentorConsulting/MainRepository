import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Query-string-free equivalent of /ge/[token]?type=themis — needed because this
// link gets embedded as a per-recipient Moosend custom field value (see
// exodikastikos_link in gemi-campaign-vars.ts), and Moosend's subscribe API
// rejects custom field values containing "?" (and &, %, +, <, >, ", ', among
// others) with "Code -1: You cannot use characters...". Putting the mode in
// the path instead of a query param keeps the link Moosend-safe while landing
// on the exact same ΘΕΜΙΣ/exodikastikos flow.
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const baseUrl = process.env.APP_URL || new URL(request.url).origin

  ;(async () => {
    const matchToken = await prisma.gemiMatchToken.findUnique({
      where: { token },
      select: { gemiId: true },
    })
    if (!matchToken) return
    await prisma.gemiCampaignRecipient.updateMany({
      where: { gemiId: matchToken.gemiId, channel: 'EMAIL', status: 'sent', clickedAt: null },
      data: { clickedAt: new Date() },
    })
  })().catch(err => console.error('[GeClick] tracking failed:', err instanceof Error ? err.message : err))

  const dest = new URL(`${baseUrl}/gemi-entry/${token}`)
  dest.searchParams.set('type', 'themis')
  return NextResponse.redirect(dest.toString(), 302)
}
