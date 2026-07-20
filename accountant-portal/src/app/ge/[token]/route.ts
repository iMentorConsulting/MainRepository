import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const type = request.nextUrl.searchParams.get('type') ?? 'ermis'
  const baseUrl = process.env.APP_URL || new URL(request.url).origin

  // Own click tracking: Moosend cannot track clicks on merge-tag (per-recipient)
  // URLs, but every campaign email's CTA lands here — record the click on the
  // recipient rows for this business. Fire-and-forget; never delays the redirect.
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

  return NextResponse.redirect(`${baseUrl}/gemi-entry/${token}?type=${type}`, 302)
}
