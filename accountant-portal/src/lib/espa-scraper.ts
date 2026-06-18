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

const REQUEST_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'el-GR,el;q=0.9,en;q=0.8',
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
    headers: { ...REQUEST_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) {
    throw new Error(`ESPA page fetch failed: HTTP ${res.status}`)
  }
  return res.text()
}

export async function fetchEspaAnnouncements(maxPages = 3): Promise<EspaScrapedItem[]> {
  const res = await fetch(ESPA_LISTING_URL, { headers: REQUEST_HEADERS })
  if (!res.ok) {
    throw new Error(`ESPA fetch failed: HTTP ${res.status}`)
  }

  let html = await res.text()
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
      html = await postEspaPage(fields)
      $ = cheerio.load(html)
      items.push(...parseItems($))
    } catch (err: any) {
      console.error(`[ESPA scraper] failed to fetch page ${page}:`, err?.message)
      break
    }
  }

  return items
}

export async function fetchEspaDetail(detailUrl: string): Promise<EspaDetailInfo> {
  const res = await fetch(detailUrl, { headers: REQUEST_HEADERS })
  if (!res.ok) {
    throw new Error(`ESPA detail fetch failed: HTTP ${res.status}`)
  }

  const html = await res.text()
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
