import * as cheerio from 'cheerio'

// ependyseis.mindev.gov.gr lists ΦΕΚ/αποφάσεις ανά καθεστώς (π.χ. "Μεγάλες
// Επενδύσεις") και κύκλο ("Κύκλος 1", "Κύκλος 2", ...). Δεν υπάρχει σελίδα
// ανά πρόγραμμα — μόνο τίτλος + ένα ή περισσότερα συνημμένα PDF (ΦΕΚ/απόφαση),
// οπότε δεν χρειάζεται ξεχωριστό detail fetch όπως στο ESPA/DYPA.
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchViaScrapingAnt(url: string, attempt = 1): Promise<string> {
  const apiKey = process.env.SCRAPINGANT_API_KEY
  if (!apiKey) throw new Error('SCRAPINGANT_API_KEY is not configured')

  const proxyUrl = new URL('https://api.scrapingant.com/v2/general')
  proxyUrl.searchParams.set('url', url)
  proxyUrl.searchParams.set('x-api-key', apiKey)
  proxyUrl.searchParams.set('browser', 'true')
  proxyUrl.searchParams.set('proxy_country', 'DE')

  const res = await fetch(proxyUrl.toString())

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

async function fetchDirect(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept-Language': 'el-GR,el;q=0.9,en;q=0.8',
    },
  })
  if (!res.ok) throw new Error(`Anaptyxiakos fetch failed: HTTP ${res.status}`)
  return res.text()
}

async function fetchHtml(url: string): Promise<string> {
  if (process.env.SCRAPINGANT_API_KEY) {
    return fetchViaScrapingAnt(url)
  }
  console.warn('[Anaptyxiakos scraper] SCRAPINGANT_API_KEY not set — attempting direct fetch')
  return fetchDirect(url)
}

export interface AnaptyxiakosScrapedItem {
  externalItemId: string
  title: string
  category: string | null
  cycle: string | null
  attachmentUrls: string[]
  attachmentNames: string[]
}

export const ANAPTYXIAKOS_LISTING_URL = 'https://ependyseis.mindev.gov.gr/el/idiotikes/prokirikseis'

function absoluteUrl(href: string): string {
  if (href.startsWith('http')) return href
  return `https://ependyseis.mindev.gov.gr${href.startsWith('/') ? '' : '/'}${href}`
}

function slugFromUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

// The listing groups items under category headings (<h4>) and, within each
// category, optional "Κύκλος N" sub-headings — both apply to every item that
// follows until the next heading of that kind. Each item is a
// .py-3.border-bottom block with a bold title and one or more PDF links.
function parseItems($: cheerio.CheerioAPI): AnaptyxiakosScrapedItem[] {
  const items: AnaptyxiakosScrapedItem[] = []
  let currentCategory: string | null = null
  let currentCycle: string | null = null

  const container = $('.showAnnouncement .col-lg-10').first()

  container.children().each((_, el) => {
    const $el = $(el)
    const tag = el.type === 'tag' ? el.name?.toLowerCase() : ''

    if (tag === 'h4') {
      currentCategory = $el.text().replace(/\s+/g, ' ').trim() || null
      currentCycle = null
      return
    }

    if (!($el.hasClass('py-3') && $el.hasClass('border-bottom'))) return

    const cycleLabel = $el.find('.h6.text-primary').first().text().replace(/\s+/g, ' ').trim()
    if (cycleLabel) currentCycle = cycleLabel

    const title = $el.find('.col-md-9 .mb-2 b').first().text().replace(/\s+/g, ' ').trim()
    if (!title) return

    const attachmentUrls: string[] = []
    const attachmentNames: string[] = []
    $el.find('.related-file a').each((__, a) => {
      const $a = $(a)
      const href = $a.attr('href')
      if (!href) return
      attachmentUrls.push(absoluteUrl(href))
      attachmentNames.push($a.attr('title')?.trim() || 'Σχετικό αρχείο')
    })
    if (attachmentUrls.length === 0) return

    items.push({
      externalItemId: slugFromUrl(attachmentUrls[0]),
      title,
      category: currentCategory,
      cycle: currentCycle,
      attachmentUrls,
      attachmentNames,
    })
  })

  return items
}

const MAX_PAGE_SAFETY_LIMIT = 50

export async function fetchAnaptyxiakosAnnouncements(): Promise<AnaptyxiakosScrapedItem[]> {
  const items: AnaptyxiakosScrapedItem[] = []
  const seenIds = new Set<string>()

  for (let page = 1; page <= MAX_PAGE_SAFETY_LIMIT; page++) {
    const url = page === 1 ? ANAPTYXIAKOS_LISTING_URL : `${ANAPTYXIAKOS_LISTING_URL}?page=${page}`
    let html: string
    try {
      html = await fetchHtml(url)
    } catch (err: any) {
      if (page === 1) throw err
      console.error(`[Anaptyxiakos scraper] failed to fetch page ${page}:`, err?.message)
      break
    }

    const $ = cheerio.load(html)
    const pageItems = parseItems($)
    for (const item of pageItems) {
      if (seenIds.has(item.externalItemId)) continue
      seenIds.add(item.externalItemId)
      items.push(item)
    }

    const hasNextPage = $('a.page-link[rel="next"]').length > 0
    if (!hasNextPage) break
  }

  return items
}
