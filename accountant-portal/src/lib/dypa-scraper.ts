import * as cheerio from 'cheerio'

// www.dypa.gov.gr runs bot-protection that blocks plain HTTP fetches (from
// Railway directly, and from free read-proxies like r.jina.ai) — it needs a
// real browser to render the page. Route requests through ScrapingAnt, which
// renders pages in a headless browser before returning the HTML.
function fetchViaProxy(url: string) {
  const apiKey = process.env.SCRAPINGANT_API_KEY
  if (!apiKey) throw new Error('SCRAPINGANT_API_KEY is not configured')

  const proxyUrl = new URL('https://api.scrapingant.com/v2/general')
  proxyUrl.searchParams.set('url', url)
  proxyUrl.searchParams.set('x-api-key', apiKey)
  proxyUrl.searchParams.set('browser', 'true')
  return fetch(proxyUrl.toString())
}

export interface DypaScrapedItem {
  externalItemId: string
  title: string
  detailUrl: string
  status: string | null
  isClosed: boolean
}

export interface DypaDetailInfo {
  description: string | null
  attachmentUrls: string[]
  attachmentNames: string[]
}

export const DYPA_LISTING_URL = 'https://www.dypa.gov.gr/active-employment-policies'

function slugFromUrl(url: string): string {
  return url.replace(/\/+$/, '').split('/').pop() || url
}

function parseItems($: cheerio.CheerioAPI): DypaScrapedItem[] {
  const items: DypaScrapedItem[] = []

  $('div.prog').each((_, el) => {
    const $el = $(el)
    const title = $el.find('span.name').first().text().trim()
    const detailUrl = $el.find('a.progLink').first().attr('href') || ''
    if (!title || !detailUrl) return

    const statusEl = $el.find('div.status').first()
    const status = statusEl.text().trim() || null
    const isClosed = statusEl.hasClass('closed')

    items.push({
      externalItemId: slugFromUrl(detailUrl),
      title,
      detailUrl,
      status,
      isClosed,
    })
  })

  return items
}

// Hard ceiling on pages fetched, in case the site's pagination ever stops
// reporting rel="next" correctly — prevents an unbounded request loop.
const MAX_PAGE_SAFETY_LIMIT = 100

export async function fetchDypaAnnouncements(): Promise<DypaScrapedItem[]> {
  const items: DypaScrapedItem[] = []

  for (let page = 1; page <= MAX_PAGE_SAFETY_LIMIT; page++) {
    const url = page === 1 ? DYPA_LISTING_URL : `${DYPA_LISTING_URL}?page=${page}`
    const res = await fetchViaProxy(url)
    if (!res.ok) {
      if (page === 1) throw new Error(`DYPA fetch failed: HTTP ${res.status}`)
      console.error(`[DYPA scraper] failed to fetch page ${page}: HTTP ${res.status}`)
      break
    }

    const html = await res.text()
    const $ = cheerio.load(html)
    items.push(...parseItems($))

    const hasNextPage = $('a.page-link[rel="next"]').length > 0
    if (!hasNextPage) break
  }

  return items.filter(item => !item.isClosed)
}

export async function fetchDypaDetail(detailUrl: string): Promise<DypaDetailInfo> {
  const res = await fetchViaProxy(detailUrl)
  if (!res.ok) {
    throw new Error(`DYPA detail fetch failed: HTTP ${res.status}`)
  }

  const html = await res.text()
  const $ = cheerio.load(html)

  const descriptionEl = $('div.innerSidebar div.description').first()
  const description = descriptionEl.length
    ? descriptionEl
        .find('p, li')
        .map((_, p) => $(p).text().trim())
        .get()
        .filter(Boolean)
        .join('\n')
    : null

  const attachmentUrls: string[] = []
  const attachmentNames: string[] = []
  $('div.tab-pane[data-tab="nomiko-plaisio"] div.deltio.files a.download').each((_, a) => {
    const $a = $(a)
    const href = $a.attr('href')
    if (!href) return
    const url = href.startsWith('http') ? href : `https://www.dypa.gov.gr${href.startsWith('/') ? '' : '/'}${href}`
    attachmentUrls.push(url)
    attachmentNames.push($a.find('span.name').first().text().trim() || 'Σχετικό αρχείο')
  })

  return { description, attachmentUrls, attachmentNames }
}
