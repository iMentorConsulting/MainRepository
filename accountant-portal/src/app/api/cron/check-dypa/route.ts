import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import { fetchDypaAnnouncements, fetchDypaDetail } from '@/lib/dypa-scraper'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (request.nextUrl.searchParams.get('reset') === '1') {
    await prisma.dypaAnnouncement.deleteMany({})
  }
  return runCheck()
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runCheck()
}

async function runCheck() {

  let scraped
  try {
    scraped = await fetchDypaAnnouncements()
  } catch (err: any) {
    console.error('[DYPA cron] scrape failed:', err?.message)
    return NextResponse.json({ error: 'Scrape failed', detail: err.message }, { status: 502 })
  }

  if (scraped.length === 0) {
    console.error('[DYPA cron] scrape returned 0 items — page structure may have changed')
    return NextResponse.json({ ok: true, newCount: 0, warning: 'Zero items parsed — check selectors' })
  }

  const existingIds = new Set(
    (await prisma.dypaAnnouncement.findMany({ select: { externalItemId: true } })).map(a => a.externalItemId)
  )

  const newItems = scraped.filter(item => !existingIds.has(item.externalItemId))

  if (newItems.length > 0) {
    const enriched = await Promise.all(
      newItems.map(async item => {
        try {
          const detail = await fetchDypaDetail(item.detailUrl)
          return { ...item, ...detail }
        } catch (err: any) {
          console.error(`[DYPA cron] detail fetch failed for ${item.externalItemId}:`, err?.message)
          return { ...item, description: null, attachmentUrls: [], attachmentNames: [] }
        }
      })
    )

    await prisma.dypaAnnouncement.createMany({
      data: enriched.map(item => ({
        externalItemId: item.externalItemId,
        title: item.title,
        detailUrl: item.detailUrl,
        status: item.status,
        description: item.description,
        attachmentUrls: item.attachmentUrls,
        attachmentNames: item.attachmentNames,
      })),
    })

    try {
      await sendEmail({
        to: process.env.ADMIN_EMAIL || 'info@i-mentor.gr',
        subject: `📢 ${newItems.length} νέα προγράμματα ΔΥΠΑ προς έγκριση`,
        html: `<p>Βρέθηκαν <strong>${newItems.length}</strong> νέα προγράμματα στη ΔΥΠΑ:</p>
          <ul>${newItems.map(i => `<li><a href="${i.detailUrl}">${i.title}</a>${i.status ? ` — ${i.status}` : ''}</li>`).join('')}</ul>
          <p><a href="${process.env.APP_URL || 'https://logistis.i-mentor.gr'}/programs">Δείτε τα στο LOGISTIS →</a></p>`,
      })
    } catch (err: any) {
      console.error('[DYPA cron] notification email failed:', err?.message)
    }
  }

  return NextResponse.json({ ok: true, scannedCount: scraped.length, newCount: newItems.length })
}
