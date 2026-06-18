import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import { fetchEspaAnnouncements } from '@/lib/espa-scraper'

export const runtime = 'nodejs'
export const maxDuration = 60

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
    scraped = await fetchEspaAnnouncements()
  } catch (err: any) {
    console.error('[ESPA cron] scrape failed:', err?.message)
    return NextResponse.json({ error: 'Scrape failed', detail: err.message }, { status: 502 })
  }

  if (scraped.length === 0) {
    console.error('[ESPA cron] scrape returned 0 items — page structure may have changed')
    return NextResponse.json({ ok: true, newCount: 0, warning: 'Zero items parsed — check selectors' })
  }

  const existingIds = new Set(
    (await prisma.espaAnnouncement.findMany({ select: { externalItemId: true } })).map(a => a.externalItemId)
  )

  const newItems = scraped.filter(item => !existingIds.has(item.externalItemId))

  if (newItems.length > 0) {
    await prisma.espaAnnouncement.createMany({
      data: newItems.map(item => ({
        externalItemId: item.externalItemId,
        title: item.title,
        detailUrl: item.detailUrl,
        status: item.status,
        operationalProgram: item.operationalProgram,
        applicationArea: item.applicationArea,
        submissionPeriod: item.submissionPeriod,
      })),
    })

    try {
      await sendEmail({
        to: process.env.ADMIN_EMAIL || 'info@i-mentor.gr',
        subject: `📢 ${newItems.length} νέα προγράμματα ΕΣΠΑ προς έγκριση`,
        html: `<p>Βρέθηκαν <strong>${newItems.length}</strong> νέες προκηρύξεις στο ΕΣΠΑ:</p>
          <ul>${newItems.map(i => `<li><a href="${i.detailUrl}">${i.title}</a>${i.status ? ` — ${i.status}` : ''}</li>`).join('')}</ul>
          <p><a href="${process.env.APP_URL || 'https://logistis.i-mentor.gr'}/programs">Δείτε τα στο LOGISTIS →</a></p>`,
      })
    } catch (err: any) {
      console.error('[ESPA cron] notification email failed:', err?.message)
    }
  }

  return NextResponse.json({ ok: true, scannedCount: scraped.length, newCount: newItems.length })
}
