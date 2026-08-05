import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import { fetchEspaAnnouncements, fetchEspaDetail } from '@/lib/espa-scraper'
import { auth } from '@/lib/auth'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (request.nextUrl.searchParams.get('reset') === '1') {
    await prisma.espaAnnouncement.deleteMany({})
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
    update: { espaCronLastRunAt: new Date(), espaCronLastError: error },
    create: { id: 'main', espaCronLastRunAt: new Date(), espaCronLastError: error },
  }).catch(() => {})
}

async function runCheck() {

  let scraped
  try {
    scraped = await fetchEspaAnnouncements(3)
  } catch (err: any) {
    console.error('[ESPA cron] scrape failed:', err?.message)
    await recordRun(err?.message || 'Scrape failed')
    return NextResponse.json({ error: 'Scrape failed', detail: err.message }, { status: 502 })
  }

  if (scraped.length === 0) {
    console.error('[ESPA cron] scrape returned 0 items — page structure may have changed')
    await recordRun('Zero items parsed — check selectors')
    return NextResponse.json({ ok: true, newCount: 0, warning: 'Zero items parsed — check selectors' })
  }

  const existingIds = new Set(
    (await prisma.espaAnnouncement.findMany({ select: { externalItemId: true } })).map(a => a.externalItemId)
  )

  const newItems = scraped.filter(item => !existingIds.has(item.externalItemId))

  if (newItems.length > 0) {
    const enriched = await Promise.all(
      newItems.map(async item => {
        try {
          const detail = await fetchEspaDetail(item.detailUrl)
          return { ...item, ...detail }
        } catch (err: any) {
          console.error(`[ESPA cron] detail fetch failed for ${item.externalItemId}:`, err?.message)
          return { ...item, description: null, beneficiaries: null, budget: null, attachmentUrls: [], attachmentNames: [] }
        }
      })
    )

    await prisma.espaAnnouncement.createMany({
      data: enriched.map(item => ({
        externalItemId: item.externalItemId,
        title: item.title,
        detailUrl: item.detailUrl,
        status: item.status,
        operationalProgram: item.operationalProgram,
        applicationArea: item.applicationArea,
        submissionPeriod: item.submissionPeriod,
        description: item.description,
        beneficiaries: item.beneficiaries,
        budget: item.budget,
        attachmentUrls: item.attachmentUrls,
        attachmentNames: item.attachmentNames,
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

  await recordRun(null)
  return NextResponse.json({ ok: true, scannedCount: scraped.length, newCount: newItems.length })
}
