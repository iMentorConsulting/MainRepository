// Fills the office's own "Business Plan — Ταμείο Μικροπιστώσεων" Word
// template (src/lib/assets/microcredits-business-plan-template.docx) with
// business data + the AI-drafted narrative. The template is a prepared copy
// of the real template with {{TOKEN}} placeholders inserted into every
// fillable field — see the one-time preparation notes below for exactly
// which paragraph (by w14:paraId) each token replaced.
//
// Simple tokens are a single value substituted in place. "Multi" tokens
// (ΚΑΔ Επιχείρησης/Επένδυσης, and the three narrative sections) can render
// as several Word paragraphs — the placeholder paragraph is cloned once per
// line/paragraph of content, reusing its exact formatting, and removed if
// given zero lines.
import fs from 'fs'
import path from 'path'
import JSZip from 'jszip'

const TEMPLATE_PATH = path.join(process.cwd(), 'src/lib/assets/microcredits-business-plan-template.docx')

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function replaceSimple(xml: string, token: string, value: string): string {
  const marker = `{{${token}}}`
  if (!xml.includes(marker)) return xml
  return xml.split(marker).join(escapeXml(value))
}

const RUN_STYLE = '<w:rFonts w:ascii="Trebuchet MS" w:eastAsia="Trebuchet MS" w:hAnsi="Trebuchet MS" w:cs="Trebuchet MS"/><w:sz w:val="20"/>'
const RUN_STYLE_BOLD = `${RUN_STYLE}<w:b/><w:bCs/>`

// A line is treated as a bold section/category label — not body text — when
// it's either "Α. <τίτλος>" / "A. <τίτλος>" (the lettered-point style used
// throughout section1_1/section2_1, matching the office's own examples
// exactly: bold label, then a line break, then plain body text) or an
// ALL-CAPS heading with no lowercase letters (the "ΛΕΙΤΟΥΡΓΙΚΑ ΕΞΟΔΑ (Χ%)" /
// "ΠΑΓΙΑ (Χ%)" sub-headers used in the deterministic spending breakdown).
function isLabelLine(line: string): boolean {
  if (/^[Α-ΩA-Z]\.\s+\S/.test(line)) return true
  if (/^[Α-ΩA-Z]/.test(line) && line.length <= 60 && !/[a-zα-ω]/.test(line)) return true
  return false
}

// Builds the <w:r> runs for one paragraph's text, which may contain
// embedded "\n" line breaks (rendered as <w:br/> within the SAME paragraph,
// not separate Word paragraphs — e.g. a bold label line followed by body
// text, or a header line followed by bullet sub-items). Each line after the
// first is bold only if isLabelLine() says so (normally just the first).
function buildParagraphRuns(text: string): string {
  const lines = text.split('\n')
  return lines
    .map((line, i) => {
      const style = isLabelLine(line) ? RUN_STYLE_BOLD : RUN_STYLE
      const run = `<w:r><w:rPr>${style}</w:rPr><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r>`
      const br = i < lines.length - 1 ? `<w:r><w:rPr>${RUN_STYLE}</w:rPr><w:br/></w:r>` : ''
      return run + br
    })
    .join('')
}

// Finds the <w:p ...>...{{TOKEN}}...</w:p> paragraph, then replaces it with
// one cloned paragraph (same opening tag + <w:pPr>, if any) per entry in
// `lines`. An empty `lines` array removes the paragraph entirely.
//
// `spacingAfter` (in twentieths of a point, e.g. 200 = 10pt) adds a blank
// gap after each cloned paragraph — used for the narrative sections
// (1.1/2.1/2.2), where each entry is a lettered point (Α., Β., Γ. ...) that
// reads better with breathing room between points; left unset for compact
// lists like the ΚΑΔ tables, which shouldn't gain gaps between lines.
function replaceMultiParagraph(xml: string, token: string, lines: string[], spacingAfter?: number): string {
  const marker = `{{${token}}}`
  const markerIdx = xml.indexOf(marker)
  if (markerIdx === -1) return xml

  const pStart = xml.lastIndexOf('<w:p ', markerIdx)
  const pEndTagIdx = xml.indexOf('</w:p>', markerIdx)
  if (pStart === -1 || pEndTagIdx === -1) {
    throw new Error(`Could not locate enclosing paragraph for token ${token}`)
  }
  const pEnd = pEndTagIdx + '</w:p>'.length
  const originalParagraph = xml.slice(pStart, pEnd)

  const openTagMatch = originalParagraph.match(/^<w:p [^>]*>/)
  if (!openTagMatch) throw new Error(`Could not parse opening tag for token ${token}`)
  const openTag = openTagMatch[0]

  const pPrMatch = originalParagraph.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)
  let pPr = pPrMatch ? pPrMatch[0] : ''
  if (spacingAfter) {
    const spacingTag = `<w:spacing w:after="${spacingAfter}"/>`
    pPr = pPr ? pPr.replace('<w:pPr>', `<w:pPr>${spacingTag}`) : `<w:pPr>${spacingTag}</w:pPr>`
  }

  const clonedParagraphs = lines
    .map(line => `${openTag}${pPr}${buildParagraphRuns(line)}</w:p>`)
    .join('')

  return xml.slice(0, pStart) + clonedParagraphs + xml.slice(pEnd)
}

export interface MicrocreditsBusinessPlanDocxData {
  companyName: string
  tradeName: string | null
  afm: string
  legalRep: string | null
  legalForm: string | null
  owners: { surname: string; name: string; afm: string; percentage: string }[]
  kadList: { code: string; description: string }[]
  kadInvestment: { code: string; description: string }[]
  foundingDate: string | null
  doy: string | null
  street: string | null
  streetNo: string | null
  zip: string | null
  county: string | null
  region: string | null
  phone: string | null
  email: string | null
  section1_1: string[]
  section2_1: string[]
  section2_2: string[]
  revenue: [number, number, number]
  ebitda: [number, number, number]
  netProfit: [number, number, number]
  marginPct: [number, number, number]
  date: string
}

function eur(n: number): string {
  return n.toLocaleString('el-GR') + ' €'
}

export async function buildMicrocreditsBusinessPlanDocx(data: MicrocreditsBusinessPlanDocxData): Promise<Buffer> {
  const templateBuffer = fs.readFileSync(TEMPLATE_PATH)
  const zip = await JSZip.loadAsync(templateBuffer)
  const documentFile = zip.file('word/document.xml')
  if (!documentFile) throw new Error('Το template δεν έχει word/document.xml')

  let xml = await documentFile.async('string')

  const kadToLines = (list: { code: string; description: string }[]) =>
    list.length > 0 ? list.map(k => `${k.code} ${k.description}`) : ['—']

  const simple: [string, string][] = [
    ['COMPANY_NAME', data.companyName],
    ['TRADE_NAME', data.tradeName || ''],
    ['AFM', data.afm],
    ['LEGAL_REP', data.legalRep || ''],
    ['LEGAL_FORM', data.legalForm || ''],
    ['FOUNDING_DATE', data.foundingDate || ''],
    ['DOY', data.doy || ''],
    ['STREET', data.street || ''],
    ['STREET_NO', data.streetNo || ''],
    ['ZIP', data.zip || ''],
    ['COUNTY', data.county || ''],
    ['REGION', data.region || ''],
    ['PHONE', data.phone || ''],
    ['EMAIL', data.email || ''],
    ['REV_Y1', eur(data.revenue[0])], ['REV_Y2', eur(data.revenue[1])], ['REV_Y3', eur(data.revenue[2])],
    ['EBITDA_Y1', eur(data.ebitda[0])], ['EBITDA_Y2', eur(data.ebitda[1])], ['EBITDA_Y3', eur(data.ebitda[2])],
    ['NETPROFIT_Y1', eur(data.netProfit[0])], ['NETPROFIT_Y2', eur(data.netProfit[1])], ['NETPROFIT_Y3', eur(data.netProfit[2])],
    ['MARGIN_Y1', `${data.marginPct[0]}%`], ['MARGIN_Y2', `${data.marginPct[1]}%`], ['MARGIN_Y3', `${data.marginPct[2]}%`],
    ['DATE', data.date],
  ]

  // ΦΟΡΕΙΣ ΕΠΙΧΕΙΡΗΣΗΣ table has exactly 3 rows in the template — fill
  // whichever the consultant supplied, blank out the rest.
  for (let i = 0; i < 3; i++) {
    const owner = data.owners[i]
    simple.push(
      [`OWNER${i + 1}_SURNAME`, owner?.surname || ''],
      [`OWNER${i + 1}_NAME`, owner?.name || ''],
      [`OWNER${i + 1}_AFM`, owner?.afm || ''],
      [`OWNER${i + 1}_PCT`, owner?.percentage ? `${owner.percentage}%` : ''],
    )
  }

  // COMPANY_NAME appears twice (identity table + signature block) — replace
  // both occurrences with the same value via the shared helper, which
  // already replaces every instance of a given marker.
  for (const [token, value] of simple) {
    xml = replaceSimple(xml, token, value)
  }

  xml = replaceMultiParagraph(xml, 'KAD_LIST', kadToLines(data.kadList))
  xml = replaceMultiParagraph(xml, 'KAD_INVESTMENT', kadToLines(data.kadInvestment))
  xml = replaceMultiParagraph(xml, 'SECTION_1_1', data.section1_1, 200)
  xml = replaceMultiParagraph(xml, 'SECTION_2_1', data.section2_1, 200)
  xml = replaceMultiParagraph(xml, 'SECTION_2_2', data.section2_2, 200)

  zip.file('word/document.xml', xml)
  const buffer = await zip.generateAsync({ type: 'nodebuffer' })
  return buffer
}
