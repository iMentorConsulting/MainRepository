import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import { fetchAnaptyxiakosAnnouncements } from '@/lib/anaptyxiakos-scraper'
import { auth } from '@/lib/auth'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (request.nextUrl.searchParams.get('reset') === '1') {
    await prisma.anaptyxiakosAnnouncement.deleteMany({})
  }
  return runCheck()
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret')
  if (secret === process.env.CRON_SECRET) return runCheck()
  const session = await auth()
  if (session?.user?.role === 'ADMIN') return runCheck()
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

async function recordRun(error: string | null) {
  await prisma.appSetting.upsert({
    where: { id: 'main' },
    update: { anaptyxiakosCronLastRunAt: new Date(), anaptyxiakosCronLastError: error },
    create: { id: 'main', anaptyxiakosCronLastRunAt: new Date(), anaptyxiakosCronLastError: error },
  }).catch(() => {})
}

async function runCheck() {
  let scraped
  try {
    scraped = await fetchAnaptyxiakosAnnouncements()
  } catch (err: any) {
    console.error('[Anaptyxiakos cron] scrape failed:', err?.message)
    await recordRun(err?.message || 'Scrape failed')
    return NextResponse.json({ error: 'Scrape failed', detail: err.message }, { status: 502 })
  }

  if (scraped.length === 0) {
    console.error('[Anaptyxiakos cron] scrape returned 0 items — page structure may have changed')
    await recordRun('Zero items parsed — check selectors')
    return NextResponse.json({ ok: true, newCount: 0, warning: 'Zero items parsed — check selectors' })
  }

  const existingIds = new Set(
    (await prisma.anaptyxiakosAnnouncement.findMany({ select: { externalItemId: true } })).map(a => a.externalItemId)
  )

  const newItems = scraped.filter(item => !existingIds.has(item.externalItemId))

  if (newItems.length > 0) {
    await prisma.anaptyxiakosAnnouncement.createMany({
      data: newItems.map(item => ({
        externalItemId: item.externalItemId,
        title: item.title,
        category: item.category,
        cycle: item.cycle,
        attachmentUrls: item.attachmentUrls,
        attachmentNames: item.attachmentNames,
      })),
    })

    try {
      await sendEmail({
        to: process.env.ADMIN_EMAIL || 'info@i-mentor.gr',
        subject: `📢 ${newItems.length} νέες προκηρύξεις Αναπτυξιακού Νόμου προς έγκριση`,
        html: `<p>Βρέθηκαν <strong>${newItems.length}</strong> νέες προκηρύξεις/αποφάσεις στον Αναπτυξιακό Νόμο:</p>
          <ul>${newItems.map(i => `<li>${i.title}${i.category ? ` — ${i.category}` : ''}${i.cycle ? ` (${i.cycle})` : ''}</li>`).join('')}</ul>
          <p><a href="${process.env.APP_URL || 'https://logistis.i-mentor.gr'}/programs">Δείτε τα στο LOGISTIS →</a></p>`,
      })
    } catch (err: any) {
      console.error('[Anaptyxiakos cron] notification email failed:', err?.message)
    }
  }

  await recordRun(null)
  return NextResponse.json({ ok: true, scannedCount: scraped.length, newCount: newItems.length })
}
