import * as cheerio from 'cheerio'

export interface DypaScrapedItem {
  externalItemId: string
  title: string
  detailUrl: string
  status: string | null
}

export interface DypaDetailInfo {
  description: string | null
  attachmentUrls: string[]
  attachmentNames: string[]
}

export const DYPA_LISTING_URL = 'https://www.dypa.gov.gr/active-employment-policies'

const REQUEST_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'el-GR,el;q=0.9,en;q=0.8',
}

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

    const status = $el.find('div.status').first().text().trim() || null

    items.push({
      externalItemId: slugFromUrl(detailUrl),
      title,
      detailUrl,
      status,
    })
  })

  return items
}

export async function fetchDypaAnnouncements(maxPages = 3): Promise<DypaScrapedItem[]> {
  const items: DypaScrapedItem[] = []

  for (let page = 1; page <= maxPages; page++) {
    const url = page === 1 ? DYPA_LISTING_URL : `${DYPA_LISTING_URL}?page=${page}`
    const res = await fetch(url, { headers: REQUEST_HEADERS })
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

  return items
}

export async function fetchDypaDetail(detailUrl: string): Promise<DypaDetailInfo> {
  const res = await fetch(detailUrl, { headers: REQUEST_HEADERS })
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
