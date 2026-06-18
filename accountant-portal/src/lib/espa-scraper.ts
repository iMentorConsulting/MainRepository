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

export const ESPA_LISTING_URL =
  'https://www.espa.gr/el/pages/Proclamations.aspx?k=*&ipb=False&ib=True&state=%ce%95%ce%bd%ce%b5%cf%81%ce%b3%ce%ae%7C%ce%91%ce%bd%ce%b1%ce%bc%ce%ad%ce%bd%ce%b5%cf%84%ce%b1%ce%b9%7C&fs=False'

export async function fetchEspaAnnouncements(): Promise<EspaScrapedItem[]> {
  const res = await fetch(ESPA_LISTING_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'el-GR,el;q=0.9,en;q=0.8',
    },
  })

  if (!res.ok) {
    throw new Error(`ESPA fetch failed: HTTP ${res.status}`)
  }

  const html = await res.text()
  const $ = cheerio.load(html)
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

    items.push({
      externalItemId,
      title,
      detailUrl,
      status,
      operationalProgram,
      applicationArea,
      submissionPeriod,
    })
  })

  return items
}
