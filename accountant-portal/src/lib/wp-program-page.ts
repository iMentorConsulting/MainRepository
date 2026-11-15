// "v2" rich WordPress program page.
//
// The v1 flow (wordpress.ts + WordpressTemplate.placeholders) swaps a handful of
// flat values into an HTML template. v2 is different: the template is a shell
// (CSS + static sections) and the data-driven sections — hero, stats, funded
// actions, expense table, eligibility, requirements accordion, documents,
// video, FAQ + JSON-LD — are rendered here from the full Program record.
//
// Rules:
//  - every dynamic value is HTML-escaped; JSON-LD is built via JSON.stringify
//  - a section with no data renders '' (and drops out of the chip nav)
//  - internal-only fields (pricingNote, internalNotes, ermisInstructions,
//    investmentPricingBrackets) are never read here
import { prisma } from '@/lib/prisma'
import { LEGAL_FORMS } from '@/lib/legal-forms'
import { uploadWpMedia } from '@/lib/wordpress'

export const WP_V2_MARKER = '<!--imx-v2-->'
export const BUILTIN_V2_TEMPLATE_ID = 'builtin:v2'

const CATEGORY_LABELS: Record<string, string> = {
  ESPA: 'ΕΣΠΑ',
  DYPA: 'ΔΥΠΑ',
  MICROCREDITS: 'Μικροπιστώσεις',
  EXTRAJUDICIAL: 'Εξωδικαστικός',
  RENOVATION: 'Ανακαίνιση',
  ANAPTYXIAKOS: 'Αναπτυξιακός Νόμος',
  LEADER: 'LEADER',
  OTHER: 'Χρηματοδοτικό Πρόγραμμα',
}

export interface PageAttachment { name: string; url: string }

export interface ProgramPageInput {
  program: Record<string, any>
  attachments: PageAttachment[]
  extraCriteriaLabels: string[]
}

// ─── helpers ──────────────────────────────────────────────────────────────────

export function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function ico(name: string, cls = 'imx-icon-sm'): string {
  return `<svg class="${cls}" aria-hidden="true" focusable="false"><use href="#imx-i-${name}"/></svg>`
}

function num(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}
function eur(v: unknown): string {
  return v == null || v === '' ? '' : `€${num(Number(v))}`
}
function pct(v: number): string {
  return `${Number.isInteger(v) ? v : String(v).replace('.', ',')}%`
}
function fmtDate(d: unknown): string {
  if (!d) return ''
  const date = new Date(d as string)
  if (isNaN(date.getTime())) return ''
  return date.toLocaleDateString('el-GR', { timeZone: 'Europe/Athens', day: '2-digit', month: '2-digit', year: 'numeric' })
}
function range(min: number | null, max: number | null, f: (n: number) => string): string {
  if (min != null && max != null && min !== max) return `${f(min)}–${f(max)}`
  const one = max ?? min
  return one != null ? f(one) : ''
}
function truncate(text: string, n: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= n) return t
  const cut = t.slice(0, n)
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), n * 0.6)).replace(/[,.;:\s]+$/, '') + '…'
}
function prose(text: string): string {
  return text
    .split(/\n{1,}/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => `<p class="imx-prose">${esc(s)}</p>`)
    .join('')
}
function safeUrl(u: unknown): string {
  const s = String(u ?? '').trim()
  return /^https?:\/\//i.test(s) ? s : ''
}
function arr<T = any>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}
function section(id: string, inner: string, alt = false): string {
  return `<section class="imx-section imx-anchor"${alt ? ' style="background:#fff;border-top:1px solid var(--imx-line);border-bottom:1px solid var(--imx-line)"' : ''} id="${id}" aria-labelledby="${id}-title"><div class="imx-wrap">${inner}</div></section>`
}
function head(eyebrow: string, title: string, id: string, lead?: string): string {
  return `<div class="imx-section-head"><span class="imx-eyebrow">${esc(eyebrow)}</span><h2 class="imx-h2" id="${id}-title">${esc(title)}</h2>${lead ? `<p class="imx-lead">${esc(lead)}</p>` : ''}</div>`
}

type Status = 'open' | 'upcoming' | 'closed' | 'unknown'
function programStatus(p: Record<string, any>): Status {
  const now = Date.now()
  const start = p.startDate ? new Date(p.startDate).getTime() : null
  const end = p.endDate ? new Date(p.endDate).getTime() + 24 * 3600 * 1000 : null
  if (end != null && now > end) return 'closed'
  if (start != null && now < start) return 'upcoming'
  if (start != null || end != null) return 'open'
  return 'unknown'
}

// "1. Τίτλος: κείμενο" lines → [{title, body}]
export function parseRequirements(text: string): { title: string; body: string }[] {
  const lines = text.split(/\r?\n/)
  const items: string[] = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    if (/^\d{1,3}\s*[.)]\s+/.test(line)) items.push(line.replace(/^\d{1,3}\s*[.)]\s+/, ''))
    else if (items.length && !/^[•\-–]\s/.test(line)) items[items.length - 1] += ' ' + line
    else items.push(line.replace(/^[•\-–]\s*/, ''))
  }
  return items.map(it => {
    const i = it.indexOf(':')
    if (i >= 3 && i <= 90) return { title: it.slice(0, i).trim(), body: it.slice(i + 1).trim() }
    return { title: '', body: it }
  })
}

function embedUrl(u: string): string | null {
  const yt = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,15})/)
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`
  const vm = u.match(/vimeo\.com\/(?:video\/)?(\d+)/)
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`
  return null
}

// ─── render ───────────────────────────────────────────────────────────────────

export interface RenderedProgramPage {
  scalars: Record<string, string>      // escaped
  rawScalars: Record<string, string>   // unescaped (SEO meta)
  html: Record<string, string>         // pre-rendered blocks
  seoTitle: string
  metaDesc: string
}

export function buildProgramPage(input: ProgramPageInput): RenderedProgramPage {
  const p = input.program
  const title = String(p.title ?? '')
  const description = String(p.description ?? '').trim()
  const category = String(p.category ?? 'OTHER')
  const catLabel = CATEGORY_LABELS[category] ?? 'Χρηματοδοτικό Πρόγραμμα'
  const status = programStatus(p)

  const subsidy = range(p.minSubsidyPct ?? null, p.maxSubsidyPct ?? null, pct)
  const investment = range(p.minInvestment ?? null, p.maxInvestment ?? null, eur)
  const interest = range(p.minInterestRate ?? null, p.maxInterestRate ?? null, pct)
  const budget = p.totalBudgetEur != null ? eur(p.totalBudgetEur) : ''
  const months = p.implementationMonths != null ? `${p.implementationMonths} μήνες` : ''
  const start = fmtDate(p.startDate)
  const end = fmtDate(p.endDate)
  const isLoan = category === 'MICROCREDITS'
  const websiteUrl = safeUrl(p.websiteUrl)
  const heroImage = safeUrl(p.heroImageUrl)
  const subsidyNote = String(p.subsidyNote ?? '').trim()

  // ── Deadline banner ─────────────────────────────────────────────────────────
  let banner = ''
  if (status === 'open' && end) banner = `Υποβολές αιτήσεων έως <strong>${esc(end)}</strong>`
  else if (status === 'upcoming') banner = `Υποβολές αιτήσεων από <strong>${esc(start)}</strong>${end ? ` έως <strong>${esc(end)}</strong>` : ''}`
  else if (status === 'closed') banner = `Οι υποβολές έχουν ολοκληρωθεί${end ? ` (<strong>${esc(end)}</strong>)` : ''} — ενημερωθείτε για επόμενες προκηρύξεις`
  const bannerHtml = banner
    ? `<div class="imx-deadline-banner${status === 'closed' ? ' imx-deadline-banner--closed' : ''}"><div class="imx-wrap"><div class="imx-deadline-inner"><span class="imx-deadline-pulse" aria-hidden="true"></span><span>${banner}</span></div></div></div>`
    : ''

  // ── Hero ────────────────────────────────────────────────────────────────────
  const statusLabel = { open: 'ΕΝΕΡΓΟ ΠΡΟΓΡΑΜΜΑ', upcoming: 'ΠΡΟΣΕΧΩΣ', closed: 'ΕΧΕΙ ΚΛΕΙΣΕΙ', unknown: 'ΠΡΟΓΡΑΜΜΑ' }[status]
  const heroEyebrow = `${catLabel.toUpperCase()} · ${statusLabel}`
  const subsidyLabel = isLoan ? 'Χρηματοδότηση' : 'Επιδότηση'
  const heroTitleHtml = subsidy && !isLoan
    ? `${esc(title)}<br><span class="imx-highlight">Επιδότηση ${esc(subsidy)}</span>`
    : esc(title)

  const badges: string[] = []
  if (subsidy) badges.push(`<span class="imx-hero-badge success">${ico('check')}${subsidyLabel} ${esc(subsidy)}</span>`)
  if (investment) badges.push(`<span class="imx-hero-badge">${ico('euro')}${isLoan ? 'Ποσό' : 'Επένδυση'} ${esc(investment)}</span>`)
  if (interest) badges.push(`<span class="imx-hero-badge">${ico('euro')}Επιτόκιο ${esc(interest)}</span>`)
  if (p.monthlyAmount) badges.push(`<span class="imx-hero-badge">${ico('euro')}${esc(p.monthlyAmount)} / μήνα</span>`)
  if (end && status !== 'closed') badges.push(`<span class="imx-hero-badge">${ico('clock')}Έως ${esc(end)}</span>`)

  const cardStats: [string, string][] = []
  if (subsidy) cardStats.push([subsidy, subsidyLabel.toUpperCase()])
  if (investment) cardStats.push([investment, isLoan ? 'ΠΟΣΟ' : 'ΥΨΟΣ ΕΠΕΝΔΥΣΗΣ'])
  if (!subsidy && interest) cardStats.push([interest, 'ΕΠΙΤΟΚΙΟ'])
  if (!investment && p.totalBenefit) cardStats.push([String(p.totalBenefit), 'ΣΥΝΟΛΙΚΟ ΟΦΕΛΟΣ'])
  const cardItems: string[] = []
  if (budget) cardItems.push(`Συνολικός προϋπολογισμός Δράσης <strong>${esc(budget)}</strong>`)
  if (months) cardItems.push(`Διάρκεια υλοποίησης <strong>${esc(months)}</strong>`)
  if (start) cardItems.push(`Έναρξη υποβολών <strong>${esc(start)}</strong>`)
  if (end) cardItems.push(`${status === 'closed' ? 'Έληξε' : 'Λήξη υποβολών'} <strong>${esc(end)}</strong>`)
  cardItems.push('<strong>Πλήρης ανάληψη φακέλου</strong> από την i-Mentor')
  const heroCardHtml = `<aside class="imx-hero-card" aria-label="Σύνοψη προγράμματος"><div class="imx-hero-card-title">ΜΕ ΜΙΑ ΜΑΤΙΑ</div>${
    cardStats.length ? `<div class="imx-hero-stats">${cardStats.slice(0, 2).map(([n, l]) => `<div class="imx-hero-stat"><div class="n">${esc(n)}</div><div class="l">${esc(l)}</div></div>`).join('')}</div>` : ''
  }<ul class="imx-hero-list${cardStats.length ? '' : ' imx-hero-list--first'}">${cardItems.map(t => `<li><span class="imx-hl-bullet" aria-hidden="true"><svg><use href="#imx-i-check"/></svg></span><span>${t}</span></li>`).join('')}</ul></aside>`

  // ── Stats band (only what exists, max 4) ────────────────────────────────────
  const stats: [string, string][] = []
  if (subsidy) stats.push([subsidy, subsidyLabel.toUpperCase()])
  if (p.monthlyAmount) stats.push([String(p.monthlyAmount), 'ΜΗΝΙΑΙΑ ΕΠΙΧΟΡΗΓΗΣΗ'])
  if (investment) stats.push([investment, isLoan ? 'ΠΟΣΟ ΧΡΗΜΑΤΟΔΟΤΗΣΗΣ' : 'ΕΠΙΛΕΞΙΜΗ ΕΠΕΝΔΥΣΗ'])
  if (interest) stats.push([interest, 'ΕΠΙΤΟΚΙΟ'])
  if (p.totalBenefit) stats.push([String(p.totalBenefit), 'ΣΥΝΟΛΙΚΟ ΟΦΕΛΟΣ'])
  if (budget) stats.push([budget, 'ΣΥΝΟΛΙΚΟΣ ΠΡΟΫΠΟΛΟΓΙΣΜΟΣ'])
  if (months) stats.push([months, 'ΔΙΑΡΚΕΙΑ ΥΛΟΠΟΙΗΣΗΣ'])
  if (p.subsidyMonths) stats.push([String(p.subsidyMonths), 'ΜΗΝΕΣ ΕΠΙΧΟΡΗΓΗΣΗΣ'])
  if (end) stats.push([end, status === 'closed' ? 'ΕΛΗΞΕ' : 'ΛΗΞΗ ΥΠΟΒΟΛΩΝ'])
  const shown = stats.slice(0, 4)
  const statsHtml = shown.length >= 2
    ? `<div class="imx-wrap"><div class="imx-stats-band" style="--n:${shown.length}" role="list" aria-label="Βασικά στοιχεία προγράμματος">${shown.map(([n, l]) => `<div class="imx-stat" role="listitem"><div class="imx-stat-n">${esc(n)}</div><div class="imx-stat-l">${esc(l)}</div></div>`).join('')}</div></div>`
    : ''

  // ── About ───────────────────────────────────────────────────────────────────
  const keyPoints = arr<string>(p.keyPoints).map(s => String(s).trim()).filter(Boolean)
  const facts: [string, string][] = []
  facts.push(['Κατηγορία', catLabel])
  if (start) facts.push(['Έναρξη υποβολών', start])
  if (end) facts.push(['Λήξη υποβολών', end])
  if (subsidy) facts.push([subsidyLabel, subsidy])
  if (investment) facts.push([isLoan ? 'Ποσό' : 'Ύψος επένδυσης', investment])
  if (interest) facts.push(['Επιτόκιο', interest])
  if (budget) facts.push(['Προϋπολογισμός', budget])
  if (months) facts.push(['Υλοποίηση', months])
  if (p.monthlyAmount) facts.push(['Μηνιαία επιχορήγηση', String(p.monthlyAmount)])
  if (p.subsidyMonths) facts.push(['Μήνες επιχορήγησης', String(p.subsidyMonths)])
  if (p.totalBenefit) facts.push(['Συνολικό όφελος', String(p.totalBenefit)])
  if (p.regions) facts.push(['Περιοχή ισχύος', String(p.regions)])
  const factsCard = facts.length > 1
    ? `<aside class="imx-card"><h3 class="imx-h3" style="margin-bottom:14px">Βασικά στοιχεία</h3><dl class="imx-facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl></aside>`
    : ''
  const aboutMain = `<div class="imx-card imx-card--accent"><div class="imx-icon-circle imx-icon-primary" aria-hidden="true"><svg><use href="#imx-i-target"/></svg></div>${prose(description || title)}${
    subsidyNote ? `<div class="imx-callout"><div class="imx-callout-title">${ico('alert', 'imx-icon-md')}Σημείωση για το ποσοστό</div><div class="imx-callout-body">${esc(subsidyNote)}</div></div>` : ''
  }${
    keyPoints.length ? `<h3 class="imx-h3" style="margin:24px 0 8px">Βασικά σημεία</h3><ul class="imx-text-list">${keyPoints.map(k => `<li>${esc(k)}</li>`).join('')}</ul>` : ''
  }</div>`
  const official = websiteUrl
    ? `<div class="imx-official">${ico('link', 'imx-icon-md')}<span class="imx-official-text">Επίσημη πηγή: <a href="${esc(websiteUrl)}" target="_blank" rel="noopener">Δείτε την επίσημη προκήρυξη της Δράσης</a></span></div>`
    : ''
  const sectionAbout = section('about',
    head('ΤΟ ΠΡΟΓΡΑΜΜΑ', `Τι είναι το «${title}»`, 'about') +
    (factsCard ? `<div class="imx-twocol-wide">${aboutMain}${factsCard}</div>` : `<div style="max-width:900px;margin:0 auto">${aboutMain}</div>`) +
    official)

  // ── Funded actions ──────────────────────────────────────────────────────────
  const actions = arr<{ title?: string; description?: string }>(p.fundedActions).filter(a => a?.title || a?.description)
  const sectionActions = actions.length
    ? section('actions',
        head('ΤΙ ΧΡΗΜΑΤΟΔΟΤΕΙΤΑΙ', 'Δράσεις & δαπάνες που επιδοτούνται', 'actions') +
        `<div class="imx-action-grid">${actions.map(a => `<div class="imx-card imx-action"><div class="imx-icon-circle imx-icon-accent" aria-hidden="true"><svg><use href="#imx-i-check-circle"/></svg></div><h3 class="imx-h3">${esc(a.title)}</h3>${a.description ? `<p class="imx-action-desc">${esc(a.description)}</p>` : ''}</div>`).join('')}</div>`,
        true)
    : ''

  // ── Eligible expense categories ─────────────────────────────────────────────
  const expenses = arr<{ code?: string; category?: string; expense?: string; limit?: string }>(p.expenseCategories).filter(e => e?.expense || e?.category)
  let sectionExpenses = ''
  if (expenses.length) {
    const groups = new Map<string, typeof expenses>()
    for (const e of expenses) {
      const k = (e.category || 'Λοιπές δαπάνες').trim()
      groups.set(k, [...(groups.get(k) ?? []), e])
    }
    const hasLimit = expenses.some(e => e.limit && String(e.limit).trim())
    const tables = Array.from(groups.entries()).map(([cat, rows]) =>
      `<div class="imx-exp-group"><h3 class="imx-exp-cat">${esc(cat)}</h3><div class="imx-table-wrap"><table class="imx-table"><thead><tr><th style="width:84px">Κωδ.</th><th>Δαπάνη</th>${hasLimit ? '<th style="width:30%">Όριο</th>' : ''}</tr></thead><tbody>${rows.map((r: (typeof expenses)[number]) => `<tr><td class="imx-mono">${esc(r.code)}</td><td>${esc(r.expense)}</td>${hasLimit ? `<td>${esc(r.limit)}</td>` : ''}</tr>`).join('')}</tbody></table></div></div>`).join('')
    sectionExpenses = section('expenses',
      head('ΕΠΙΛΕΞΙΜΕΣ ΔΑΠΑΝΕΣ', 'Επιλέξιμες κατηγορίες δαπανών', 'expenses',
        'Οι κατηγορίες δαπανών που μπορούν να ενταχθούν στο επενδυτικό σχέδιο, όπως ορίζονται στην προκήρυξη.') +
      `<div style="max-width:960px;margin:0 auto">${tables}</div>`)
  }

  // ── Eligibility (who can apply) ─────────────────────────────────────────────
  const kads = arr<string>(p.kadRules).filter(Boolean)
  const excludedKads = arr<string>(p.excludedKadRules).filter(Boolean)
  const kadExceptions = arr<string>(p.excludedKadExceptions).filter(Boolean)
  const legalExcluded = arr<string>(p.excludedLegalForms).filter(Boolean)
    .map(v => LEGAL_FORMS.find(f => f.value === v)?.label ?? v)
  const regionRules = arr<string>(p.regionRules).filter(Boolean)
  const zips = arr<string>(p.zipCodeRules).filter(Boolean)
  const minReg = p.minRegdate && Number(String(p.minRegdate).slice(0, 4)) >= 1990 ? String(p.minRegdate) : ''
  const maxReg = p.maxRegdate ? String(p.maxRegdate) : ''
  const beneficiaries = String(p.beneficiaries ?? '').trim()
  const extra = input.extraCriteriaLabels.filter(Boolean)
  const eligBlocks: string[] = []
  const tags = (items: string[], cls = '') => `<div class="imx-tags">${items.map(i => `<span class="imx-tag ${cls}">${esc(i)}</span>`).join('')}</div>`
  if (beneficiaries) eligBlocks.push(`<div class="imx-elig-block"><h3 class="imx-elig-title">Ωφελούμενοι</h3>${prose(beneficiaries)}</div>`)
  if (regionRules.length) eligBlocks.push(`<div class="imx-elig-block"><h3 class="imx-elig-title">Γεωγραφική περιοχή</h3>${tags(regionRules)}</div>`)
  if (zips.length) eligBlocks.push(`<div class="imx-elig-block"><h3 class="imx-elig-title">Ταχυδρομικοί κώδικες (${zips.length})</h3><details class="imx-acc imx-acc--inline"><summary>Εμφάνιση ΤΚ</summary>${tags(zips, 'imx-mono')}</details></div>`)
  if (minReg || maxReg) eligBlocks.push(`<div class="imx-elig-block"><h3 class="imx-elig-title">Ημερομηνία έναρξης επιχείρησης</h3><p class="imx-prose">${minReg ? `Από ${esc(minReg)} ` : ''}${maxReg ? `έως ${esc(maxReg)}` : ''}</p></div>`)
  if (kads.length) eligBlocks.push(`<div class="imx-elig-block"><h3 class="imx-elig-title">Επιλέξιμοι ΚΑΔ (${kads.length})</h3>${tags(kads, 'imx-mono')}</div>`)
  if (excludedKads.length) eligBlocks.push(`<div class="imx-elig-block"><h3 class="imx-elig-title">Εξαιρούμενοι ΚΑΔ</h3>${tags(excludedKads, 'imx-tag--danger imx-mono')}${kadExceptions.length ? `<p class="imx-note">Εξαιρέσεις από τον αποκλεισμό: ${esc(kadExceptions.join(', '))}</p>` : ''}</div>`)
  if (legalExcluded.length) eligBlocks.push(`<div class="imx-elig-block"><h3 class="imx-elig-title">Μη επιλέξιμες νομικές μορφές</h3>${tags(legalExcluded, 'imx-tag--danger')}</div>`)
  if (extra.length) eligBlocks.push(`<div class="imx-elig-block"><h3 class="imx-elig-title">Επιπλέον κριτήρια επιλεξιμότητας</h3><ul class="imx-text-list">${extra.map(e => `<li>${esc(e)}</li>`).join('')}</ul></div>`)
  const sectionEligibility = eligBlocks.length
    ? section('eligibility',
        head('ΕΠΙΛΕΞΙΜΟΤΗΤΑ', 'Ποιοι μπορούν να συμμετάσχουν', 'eligibility') +
        `<div class="imx-cond-card" style="max-width:960px;margin:0 auto">${eligBlocks.join('')}</div>`, true)
    : ''

  // ── Requirements accordion ──────────────────────────────────────────────────
  const reqItems = parseRequirements(String(p.otherRequirements ?? ''))
  let sectionRequirements = ''
  if (reqItems.length) {
    const body = reqItems.map((r, i) => r.title
      ? `<details class="imx-acc"><summary><span class="imx-acc-n">${i + 1}</span><span>${esc(r.title)}</span></summary><div class="imx-acc-body">${prose(r.body)}</div></details>`
      : `<div class="imx-acc imx-acc--plain"><span class="imx-acc-n">${i + 1}</span><span>${esc(r.body)}</span></div>`).join('')
    sectionRequirements = section('requirements',
      head('ΠΡΟΫΠΟΘΕΣΕΙΣ', 'Προϋποθέσεις & ειδικοί όροι', 'requirements',
        'Όσο πιο νωρίς γνωρίζετε αν είστε επιλέξιμοι, τόσο καλύτερα προετοιμάζεστε. Ελέγχουμε δωρεάν και χωρίς δέσμευση αν πληροίτε τα κριτήρια.') +
      `<div style="max-width:960px;margin:0 auto"><div class="imx-acc-list">${body}</div>
        <div class="imx-callout imx-callout--blue" style="margin-top:28px"><div class="imx-callout-title">${ico('alert', 'imx-icon-md')}Δεν είστε σίγουροι αν πληροίτε τα κριτήρια;</div><div class="imx-callout-body">Κάθε πρόγραμμα έχει επιμέρους όρους (ΚΑΔ, μέγεθος επιχείρησης, περιοχή, σώρευση ενισχύσεων). Στείλτε μας τα στοιχεία σας και θα σας απαντήσουμε <strong>άμεσα και δωρεάν</strong> αν μπορείτε να ενταχθείτε.</div></div>
        <a class="imx-btn imx-btn-solid" href="#form" style="margin-top:22px">Έλεγχος επιλεξιμότητας ${ico('arrow-right', 'imx-icon-md')}</a></div>`)
  }

  // ── Documents ───────────────────────────────────────────────────────────────
  const sectionDocs = input.attachments.length
    ? section('docs',
        head('ΣΧΕΤΙΚΑ ΑΡΧΕΙΑ', 'Έγγραφα & προκηρύξεις', 'docs') +
        `<div class="imx-docs">${input.attachments.map(a => `<a class="imx-doc" href="${esc(a.url)}" target="_blank" rel="noopener">${ico('link', 'imx-icon-md')}<span>${esc(a.name)}</span></a>`).join('')}</div>`)
    : ''

  // ── Video ───────────────────────────────────────────────────────────────────
  const videos = arr<string>(p.videoUrls).map(safeUrl).filter(Boolean)
  const sectionVideo = videos.length
    ? section('video',
        head('ΒΙΝΤΕΟ', 'Δείτε περισσότερα', 'video') +
        `<div class="imx-videos">${videos.map(v => {
          const e = embedUrl(v)
          return e
            ? `<div class="imx-video"><iframe src="${esc(e)}" title="${esc(title)}" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`
            : `<a class="imx-doc" href="${esc(v)}" target="_blank" rel="noopener">${ico('link', 'imx-icon-md')}<span>${esc(v)}</span></a>`
        }).join('')}</div>`, true)
    : ''

  // ── FAQ (strictly derived from the data) ────────────────────────────────────
  const faq: { q: string; a: string }[] = []
  if (subsidy) faq.push({ q: `Ποιο είναι το ποσοστό επιδότησης του «${title}»;`, a: `Το ποσοστό ${isLoan ? 'χρηματοδότησης' : 'επιχορήγησης'} είναι ${subsidy}.${subsidyNote ? ' ' + subsidyNote : ''}` })
  if (investment) faq.push({ q: isLoan ? 'Ποιο είναι το ύψος της χρηματοδότησης;' : 'Ποιο είναι το ύψος της επιλέξιμης επένδυσης;', a: `${isLoan ? 'Το ποσό' : 'Ο επιλέξιμος προϋπολογισμός'} κυμαίνεται ${investment.includes('–') ? 'από ' + investment.replace('–', ' έως ') : 'έως ' + investment}.` })
  if (start || end) faq.push({ q: 'Μέχρι πότε υποβάλλονται οι αιτήσεις;', a: status === 'closed' ? `Η υποβολή αιτήσεων έληξε${end ? ' στις ' + end : ''}.` : `${start ? 'Η υποβολή ξεκινά στις ' + start : 'Η υποβολή είναι ανοιχτή'}${end ? (start ? ' και λήγει στις ' : ' και λήγει στις ') + end : ''}.` })
  if (months) faq.push({ q: 'Πόσο διαρκεί η υλοποίηση της επένδυσης;', a: `Η διάρκεια υλοποίησης μετά την έγκριση είναι έως ${months}.` })
  const fundedTitles = actions.map(a => a.title).filter(Boolean) as string[]
  if (fundedTitles.length) faq.push({ q: 'Ποιες δράσεις χρηματοδοτούνται;', a: fundedTitles.slice(0, 10).join(' · ') })
  faq.push({ q: 'Πώς μπορώ να μάθω αν είμαι επιλέξιμος;', a: 'Συμπληρώστε τη φόρμα δωρεάν ελέγχου επιλεξιμότητας της σελίδας και η ομάδα της i-Mentor θα επικοινωνήσει μαζί σας με αρχική αξιολόγηση, χωρίς δέσμευση.' })
  faq.push({ q: 'Τι αναλαμβάνει η i-Mentor Consulting;', a: 'Αναλαμβάνουμε ολόκληρη τη διαδικασία: έλεγχο επιλεξιμότητας, προετοιμασία φακέλου, σύνταξη επιχειρηματικού σχεδίου, ηλεκτρονική υποβολή, παρακολούθηση της αξιολόγησης και υποστήριξη στην υλοποίηση και τις εκταμιεύσεις.' })
  const sectionFaq = section('faq',
    head('ΣΥΧΝΕΣ ΕΡΩΤΗΣΕΙΣ', 'Συχνές ερωτήσεις', 'faq') +
    `<div class="imx-acc-list" style="max-width:860px;margin:0 auto">${faq.map(f => `<details class="imx-acc"><summary><span>${esc(f.q)}</span></summary><div class="imx-acc-body"><p class="imx-prose">${esc(f.a)}</p></div></details>`).join('')}</div>`)

  // ── Chip nav (only sections that exist + static ones) ───────────────────────
  const chips: [string, string, string][] = [['about', 'book', 'Τι είναι']]
  if (sectionActions) chips.push(['actions', 'check-circle', 'Τι χρηματοδοτείται'])
  if (sectionExpenses) chips.push(['expenses', 'wallet', 'Δαπάνες'])
  if (sectionEligibility) chips.push(['eligibility', 'target', 'Επιλεξιμότητα'])
  if (sectionRequirements) chips.push(['requirements', 'clipboard', 'Προϋποθέσεις'])
  if (sectionDocs) chips.push(['docs', 'link', 'Έγγραφα'])
  chips.push(['how', 'cog', 'Διαδικασία'], ['methodology', 'monitor', 'Portal πελάτη'], ['faq', 'help', 'FAQ'], ['form', 'check-circle', 'Έλεγχος επιλεξιμότητας'])
  const chipNav = chips.map(([id, ic, label]) => `<a class="imx-chip" href="#${id}">${ico(ic)}${esc(label)}</a>`).join('')

  // ── JSON-LD ─────────────────────────────────────────────────────────────────
  const provider = { '@type': 'Organization', name: 'i-Mentor Consulting', url: 'https://i-mentor.gr/', areaServed: { '@type': 'Country', name: 'Greece' } }
  const graph: any[] = [{
    '@type': 'Service',
    name: `Συμβουλευτική για το πρόγραμμα «${title}»`,
    serviceType: `Business Consulting — ${catLabel} / Χρηματοδοτικά Προγράμματα`,
    description: truncate(description || title, 500),
    provider,
    areaServed: { '@type': 'Country', name: 'Greece' },
    ...(websiteUrl ? { url: websiteUrl } : {}),
  }, {
    '@type': 'FAQPage',
    mainEntity: faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  }]
  const jsonLd = `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c')}</script>`

  // ── SEO ─────────────────────────────────────────────────────────────────────
  const seoTitle = `${title}${subsidy && !isLoan ? ` | Επιδότηση ${subsidy}` : ''} | i-Mentor Consulting`
  const metaParts = [
    subsidy ? `${subsidyLabel} ${subsidy}` : '',
    investment ? `${isLoan ? 'ποσό' : 'επενδύσεις'} ${investment}` : '',
    end ? (status === 'closed' ? `έληξε ${end}` : `υποβολές έως ${end}`) : '',
  ].filter(Boolean)
  const metaDesc = (metaParts.length
    ? `${title}: ${metaParts.join(', ')}. Δωρεάν έλεγχος επιλεξιμότητας και πλήρης ανάληψη φακέλου από την i-Mentor.`
    : truncate(description || title, 155)
  ).slice(0, 160)

  const rawScalars: Record<string, string> = {
    TITLE: title,
    DESCRIPTION: description,
    HERO_SUB: truncate(description || title, 240),
    SUBSIDY_RANGE: subsidy,
    INVESTMENT_RANGE: investment,
    TOTAL_BUDGET: budget,
    IMPLEMENTATION_MONTHS: months,
    START_DATE: start,
    END_DATE: end,
    WEBSITE_URL: websiteUrl,
    CATEGORY_LABEL: catLabel,
    HERO_EYEBROW: heroEyebrow,
  }
  const scalars: Record<string, string> = {}
  for (const [k, v] of Object.entries(rawScalars)) scalars[k] = esc(v)
  // Used inside a CSS url('…'): http(s) only and no quote / paren / backslash.
  scalars.HERO_IMAGE_URL = heroImage
    ? heroImage.replace(/['"()\\\s<>]/g, c => encodeURIComponent(c))
    : 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='

  return {
    scalars,
    rawScalars,
    seoTitle,
    metaDesc,
    html: {
      JSONLD_HTML: jsonLd,
      BANNER_HTML: bannerHtml,
      HERO_TITLE_HTML: heroTitleHtml,
      HERO_BADGES_HTML: `<div class="imx-hero-badges">${badges.join('')}</div>`,
      HERO_CARD_HTML: heroCardHtml,
      STATS_HTML: statsHtml,
      CHIPNAV_HTML: chipNav,
      SECTION_ABOUT: sectionAbout,
      SECTION_ACTIONS: sectionActions,
      SECTION_EXPENSES: sectionExpenses,
      SECTION_ELIGIBILITY: sectionEligibility,
      SECTION_REQUIREMENTS: sectionRequirements,
      SECTION_DOCS: sectionDocs,
      SECTION_VIDEO: sectionVideo,
      SECTION_FAQ: sectionFaq,
    },
  }
}

// Single-pass token replacement: values are never re-scanned, so a value that
// itself contains "{{X}}" or "$&" cannot be misinterpreted.
export function renderTokens(template: string, maps: Record<string, string>[]): string {
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (whole, key: string) => {
    for (const m of maps) if (key in m) return m[key]
    return whole
  })
}

export function renderProgramHtml(template: string, page: RenderedProgramPage): string {
  return renderTokens(template.replace(WP_V2_MARKER, ''), [page.html, page.scalars])
}

export function renderSeoText(pattern: string | null | undefined, page: RenderedProgramPage, fallback: string): string {
  return pattern ? renderTokens(pattern, [page.rawScalars]) : fallback
}

// ─── data loading (DB + media upload) ─────────────────────────────────────────

export async function loadProgramPageInput(programId: string): Promise<{ input: ProgramPageInput; warnings: string[] } | null> {
  const program = await prisma.program.findUnique({
    where: { id: programId },
    include: { attachmentFiles: { select: { id: true, name: true, mimeType: true } } },
  })
  if (!program) return null
  const warnings: string[] = []

  const extraIds = program.extraCriteriaIds ?? []
  const extra = extraIds.length
    ? await prisma.eligibilityCriterion.findMany({ where: { id: { in: extraIds }, active: true }, orderBy: { order: 'asc' }, select: { label: true } })
    : []

  const attachments: PageAttachment[] = []
  const urls = program.attachmentUrls ?? []
  const names = program.attachmentNames ?? []
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]
    const name = (names[i] || '').trim() || decodeURIComponent(url.split('/').pop() || 'Έγγραφο')
    const m = url.match(/^\/api\/programs\/([^/]+)\/attachments\/([^/?#]+)/)
    if (!m) {
      if (safeUrl(url)) attachments.push({ name, url })
      continue
    }
    // Uploaded PDFs sit behind portal login — publish a copy to the WP media
    // library so the public page can link to it.
    try {
      const file = await prisma.programAttachmentFile.findUnique({ where: { id: m[2] } })
      if (!file || file.programId !== program.id) continue
      const ext = file.mimeType === 'application/pdf' ? 'pdf' : (file.mimeType.split('/')[1] || 'bin')
      const wpUrl = await uploadWpMedia({
        slug: `imx-${program.id.slice(-8)}-${file.id.slice(-8)}`,
        extension: ext,
        mimeType: file.mimeType,
        title: file.name,
        data: Buffer.from(file.data),
      })
      attachments.push({ name: name || file.name, url: wpUrl })
    } catch (e) {
      warnings.push(`Το αρχείο «${name}» δεν ανέβηκε στο WordPress: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return { input: { program: program as unknown as Record<string, any>, attachments, extraCriteriaLabels: extra.map(e => e.label) }, warnings }
}
