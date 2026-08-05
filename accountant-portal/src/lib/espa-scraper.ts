import * as cheerio from 'cheerio'

export interface EspaScrapedItem {
  externalItemId: string
  title: string
  detailUrl: string
  status: string | null
  operationalProgram: string | null
  applicationArea: string | null
  submissionPeriod: string | null
}

export interface EspaDetailInfo {
  description: string | null
  beneficiaries: string | null
  budget: string | null
  attachmentUrls: string[]
  attachmentNames: string[]
}

export const ESPA_LISTING_URL =
  'https://www.espa.gr/el/pages/Proclamations.aspx?k=*&ipb=False&ib=True&state=%ce%95%ce%bd%ce%b5%cf%81%ce%b3%ce%ae%7C%ce%91%ce%bd%ce%b1%ce%bc%ce%ad%ce%bd%ce%b5%cf%84%ce%b1%ce%b9%7C&fs=False'

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Route through ScrapingAnt (same approach as dypa-scraper). espa.gr sits behind
// Cloudflare which consistently times out Playwright from Railway's non-Greek IPs.
async function fetchViaScrapingAnt(url: string, attempt = 1): Promise<string> {
  const apiKey = process.env.SCRAPINGANT_API_KEY
  if (!apiKey) throw new Error('SCRAPINGANT_API_KEY is not configured')

  const proxyUrl = new URL('https://api.scrapingant.com/v2/general')
  proxyUrl.searchParams.set('url', url)
  proxyUrl.searchParams.set('x-api-key', apiKey)
  proxyUrl.searchParams.set('browser', 'true')
  proxyUrl.searchParams.set('proxy_country', 'GR')

  const res = await fetch(proxyUrl.toString())

  // 409 = concurrency cap on free plan — retry with backoff
  if (res.status === 409 && attempt < 5) {
    await sleep(attempt * 2000)
    return fetchViaScrapingAnt(url, attempt + 1)
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`ScrapingAnt fetch failed: HTTP ${res.status} ${body.slice(0, 200)}`)
  }

  return res.text()
}

// Playwright fallback: used only when SCRAPINGANT_API_KEY is absent (local dev).
async function fetchViaPlaywright(url: string, attempt = 1): Promise<string> {
  const { chromium } = await import('playwright-core')

  function getChromiumExecutablePath(): string | undefined {
    if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH
    const preinstalled = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
    try { require('fs').accessSync(preinstalled); return preinstalled } catch { return undefined }
  }

  const executablePath = getChromiumExecutablePath()
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })
  try {
    const page = await browser.newPage()
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'el-GR,el;q=0.9,en;q=0.8' })
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForSelector('div.item, .error, #ctl00_PlaceHolderMain_lblMessage', { timeout: 20000 }).catch(() => {})
    const html = await page.content()
    await browser.close()
    return html
  } catch (err: any) {
    await browser.close().catch(() => {})
    if (attempt < 3) {
      console.warn(`[ESPA scraper] Playwright attempt ${attempt} failed (${err?.message}), retrying in ${5 * attempt}s…`)
      await sleep(5000 * attempt)
      return fetchViaPlaywright(url, attempt + 1)
    }
    throw err
  }
}

async function fetchHtml(url: string): Promise<string> {
  if (process.env.SCRAPINGANT_API_KEY) {
    return fetchViaScrapingAnt(url)
  }
  console.warn('[ESPA scraper] SCRAPINGANT_API_KEY not set — falling back to Playwright')
  return fetchViaPlaywright(url)
}

function parseItems($: cheerio.CheerioAPI): EspaScrapedItem[] {
  const items: EspaScrapedItem[] = []

  $('div.item').each((_, el) => {
    const $el = $(el)
    const title = $el.find('h3').first().text().trim()
    if (!title) return

    const detailHref = $el.find('a[href*="ProclamationsFS.aspx?item="]').first().attr('href') || ''
    const idMatch = detailHref.match(/item=(\d+)/)
    if (!idMatch) return
    const externalItemId = idMatch[1]
    const detailUrl = detailHref.startsWith('http')
      ? detailHref
      : `https://www.espa.gr${detailHref.startsWith('/') ? '' : '/'}${detailHref}`

    let status: string | null = null
    const statusSpan = $el.find('p > span[style*="color"]').first()
    if (statusSpan.length) status = statusSpan.text().trim() || null

    function fieldAfterLabel(label: string): string | null {
      let value: string | null = null
      $el.find('p').each((__, p) => {
        const $p = $(p)
        const b = $p.find('b').first()
        if (b.length && b.text().trim().startsWith(label)) {
          value = $p.text().replace(b.text(), '').trim() || null
        }
      })
      return value
    }

    const operationalProgram = fieldAfterLabel('Επιχειρησιακό πρόγραμμα')
    const applicationArea = fieldAfterLabel('Περιοχή εφαρμογής')
    const submissionPeriod = fieldAfterLabel('Περίοδος υποβολής')

    items.push({ externalItemId, title, detailUrl, status, operationalProgram, applicationArea, submissionPeriod })
  })

  return items
}

function extractHiddenFields($: cheerio.CheerioAPI): Record<string, string> {
  const fields: Record<string, string> = {}
  $('input[type="hidden"]').each((_, el) => {
    const name = $(el).attr('name')
    if (name) fields[name] = $(el).attr('value') || ''
  })
  return fields
}

async function postEspaPage(fields: Record<string, string>): Promise<string> {
  const body = new URLSearchParams(fields)
  const res = await fetch(ESPA_LISTING_URL, {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'el-GR,el;q=0.9,en;q=0.8',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })
  if (!res.ok) throw new Error(`ESPA pagination POST failed: HTTP ${res.status}`)
  return res.text()
}

export async function fetchEspaAnnouncements(maxPages = 3): Promise<EspaScrapedItem[]> {
  const html = await fetchHtml(ESPA_LISTING_URL)
  let $ = cheerio.load(html)
  const items: EspaScrapedItem[] = parseItems($)

  const dropdown = $('select[name*="DropDownListPagesTop"]').first()
  const dropdownName = dropdown.attr('name')
  const totalPages = dropdown.length ? Math.min(dropdown.find('option').length, maxPages) : 1

  for (let page = 2; page <= totalPages; page++) {
    if (!dropdownName) break
    const fields = extractHiddenFields($)
    fields[dropdownName] = String(page)
    fields['__EVENTTARGET'] = dropdownName
    fields['__EVENTARGUMENT'] = ''

    try {
      const pageHtml = await postEspaPage(fields)
      $ = cheerio.load(pageHtml)
      items.push(...parseItems($))
    } catch (err: any) {
      console.error(`[ESPA scraper] failed to fetch page ${page}:`, err?.message)
      break
    }
  }

  return items
}

export async function fetchEspaDetail(detailUrl: string): Promise<EspaDetailInfo> {
  const html = await fetchHtml(detailUrl)
  const $ = cheerio.load(html)

  const storyClone = $('.story').first().clone()
  storyClone.find('h3, .add-proclamation, .stretch_field, .stretch-fields, .stretch-field').remove()
  const description = storyClone.text().replace(/\s+/g, ' ').trim() || null

  function fieldText(label: string): string | null {
    let value: string | null = null
    $('h4').each((_, h) => {
      const $h = $(h)
      if ($h.text().trim() === label) {
        const valDiv = $h.nextAll('div.perifereia').first()
        if (valDiv.length) value = valDiv.text().replace(/\s+/g, ' ').trim() || null
      }
    })
    return value
  }

  const beneficiaries = fieldText('Σε ποιους απευθύνεται')
  const budget = fieldText('Προϋπολογισμός')

  const attachmentUrls: string[] = []
  const attachmentNames: string[] = []
  $('ul.files li a').each((_, a) => {
    const href = $(a).attr('href')
    if (href) {
      attachmentUrls.push(href)
      attachmentNames.push($(a).text().trim() || 'Σχετικό αρχείο')
    }
  })

  return { description, beneficiaries, budget, attachmentUrls, attachmentNames }
}
