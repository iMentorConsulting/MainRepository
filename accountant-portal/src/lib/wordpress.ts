const WP_URL = (process.env.WORDPRESS_URL ?? '').replace(/\/$/, '')
const WP_USER = process.env.WORDPRESS_USERNAME ?? ''
const WP_PASS = process.env.WORDPRESS_APP_PASSWORD ?? ''

function wpAuth(): string {
  return 'Basic ' + Buffer.from(`${WP_USER}:${WP_PASS}`).toString('base64')
}

async function wpFetch(path: string, options: RequestInit = {}): Promise<unknown> {
  if (!WP_URL || !WP_USER || !WP_PASS) {
    throw new Error('WordPress env vars not configured (WORDPRESS_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD)')
  }
  const url = `${WP_URL}/wp-json/wp/v2${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: wpAuth(),
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`WordPress API ${res.status}: ${text.slice(0, 400)}`)
  }
  try { return JSON.parse(text) } catch { return text }
}

export interface WpPage {
  id: number
  slug: string
  link: string
  status: string
  title: { rendered: string }
  content: { rendered: string }
  meta?: Record<string, unknown>
}

// Fetch a page by its ID (includes raw meta for Elementor)
export async function getWpPage(pageId: number): Promise<WpPage & { meta: Record<string, unknown> }> {
  const data = await wpFetch(`/pages/${pageId}?context=edit&_fields=id,slug,link,status,title,content,meta`) as any
  return data
}

// Get the raw Elementor post meta for a page (requires REST API meta exposure)
export async function getElementorData(pageId: number): Promise<string | null> {
  const data = await wpFetch(`/pages/${pageId}?context=edit`) as any
  // Elementor stores layout as JSON string in _elementor_data meta
  return data?.meta?._elementor_data ?? null
}

// List pages for template picker (returns lightweight list)
export async function listWpPages(perPage = 50): Promise<Array<{ id: number; title: string; link: string }>> {
  const data = await wpFetch(`/pages?per_page=${perPage}&status=publish,draft&_fields=id,title,link&orderby=title&order=asc`) as any[]
  return (data || []).map((p: any) => ({ id: p.id, title: p.title?.rendered ?? String(p.id), link: p.link }))
}

export interface CreatePageOpts {
  title: string
  slug?: string
  // Raw Elementor JSON (already with placeholders replaced)
  elementorData?: string
  // Plain HTML fallback when no Elementor data
  htmlContent?: string
  status?: 'draft' | 'publish'
  // Additional post meta to set
  meta?: Record<string, unknown>
}

export async function createWpPage(opts: CreatePageOpts): Promise<{ id: number; link: string }> {
  const body: Record<string, unknown> = {
    title: opts.title,
    status: opts.status ?? 'draft',
    content: opts.htmlContent ?? '',
  }
  if (opts.slug) body.slug = opts.slug

  const meta: Record<string, unknown> = {
    // Mark page as built with Elementor so Elementor renders it
    _elementor_edit_mode: 'builder',
    _elementor_template_type: 'wp-page',
    _elementor_version: '3.0.0',
    ...opts.meta,
  }
  if (opts.elementorData) {
    meta._elementor_data = opts.elementorData
  }
  body.meta = meta

  const data = await wpFetch('/pages', { method: 'POST', body: JSON.stringify(body) }) as any
  return { id: data.id, link: data.link }
}

// Clone an existing WP page's Elementor data and replace placeholder tokens
export async function cloneElementorPage(opts: {
  templatePageId: number
  newTitle: string
  slug?: string
  replacements: Record<string, string>
  status?: 'draft' | 'publish'
}): Promise<{ id: number; link: string }> {
  const page = await wpFetch(`/pages/${opts.templatePageId}?context=edit`) as any

  // Clone Elementor JSON and apply replacements
  let elementorData: string | null = page?.meta?._elementor_data ?? null
  if (elementorData) {
    for (const [token, value] of Object.entries(opts.replacements)) {
      // token might be "{{TITLE}}" — escape for regex
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      elementorData = elementorData.replace(new RegExp(escaped, 'g'), value)
    }
  }

  // Also clone plain content with replacements (fallback / shortcode pages)
  let content: string = page?.content?.raw ?? page?.content?.rendered ?? ''
  for (const [token, value] of Object.entries(opts.replacements)) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    content = content.replace(new RegExp(escaped, 'g'), value)
  }

  // Clone Elementor CSS cache keys too if present
  const meta: Record<string, unknown> = {
    _elementor_edit_mode: 'builder',
    _elementor_template_type: 'wp-page',
    _elementor_version: page?.meta?._elementor_version ?? '3.0.0',
  }
  if (elementorData) meta._elementor_data = elementorData

  const body: Record<string, unknown> = {
    title: opts.newTitle,
    status: opts.status ?? 'draft',
    content,
    meta,
  }
  if (opts.slug) body.slug = opts.slug

  const data = await wpFetch('/pages', { method: 'POST', body: JSON.stringify(body) }) as any
  return { id: data.id, link: data.link }
}

// Builds the minimal Elementor JSON for a single HTML widget containing all content.
function buildElementorHtmlPage(htmlContent: string): string {
  const rnd = () => Math.random().toString(36).substr(2, 7)
  return JSON.stringify([{
    id: rnd(), elType: 'section', isInner: false, settings: {},
    elements: [{
      id: rnd(), elType: 'column', isInner: false,
      settings: { _column_size: 100, _inline_size: null },
      elements: [{
        id: rnd(), elType: 'widget', widgetType: 'html',
        settings: { html: htmlContent },
        elements: [],
      }],
    }],
  }])
}

// Creates a WP page from scratch with a single Elementor HTML widget and full SEO meta.
// Supports both Yoast SEO and RankMath (sets both; whichever plugin is active wins).
export async function createWpPageFromHtmlTemplate(opts: {
  title: string
  slug: string
  htmlContent: string
  seoTitle: string
  metaDesc: string
  focusKeyword: string
  ogImageUrl?: string
  status?: 'draft' | 'publish'
}): Promise<{ id: number; link: string }> {
  const elementorData = buildElementorHtmlPage(opts.htmlContent)
  const meta: Record<string, unknown> = {
    // Elementor builder markers
    _elementor_edit_mode: 'builder',
    _elementor_template_type: 'wp-page',
    _elementor_version: '3.0.0',
    _elementor_data: elementorData,
    // Yoast SEO
    _yoast_wpseo_title: opts.seoTitle,
    _yoast_wpseo_metadesc: opts.metaDesc,
    _yoast_wpseo_focuskw: opts.focusKeyword,
    '_yoast_wpseo_opengraph-title': opts.seoTitle,
    '_yoast_wpseo_opengraph-description': opts.metaDesc,
    // RankMath SEO
    rank_math_title: opts.seoTitle,
    rank_math_description: opts.metaDesc,
    rank_math_focus_keyword: opts.focusKeyword,
  }
  if (opts.ogImageUrl && !opts.ogImageUrl.startsWith('data:')) {
    meta['_yoast_wpseo_opengraph-image'] = opts.ogImageUrl
    meta.rank_math_og_content_image = opts.ogImageUrl
  }

  const data = await wpFetch('/pages', {
    method: 'POST',
    body: JSON.stringify({
      title: opts.title,
      slug: opts.slug,
      status: opts.status ?? 'draft',
      content: '',
      excerpt: opts.metaDesc,
      meta,
    }),
  }) as any
  return { id: data.id, link: data.link }
}

// Greek-safe slug from a program title (a-z, 0-9, hyphens).
export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[αάΑΆ]/g, 'a').replace(/[εέΕΈ]/g, 'e').replace(/[ηήΗΉ]/g, 'i')
    .replace(/[ιίΙΊ]/g, 'i').replace(/[οόΟΌ]/g, 'o').replace(/[υύΥΎ]/g, 'y')
    .replace(/[ωώΩΏ]/g, 'o').replace(/[θΘ]/g, 'th').replace(/[χΧ]/g, 'ch')
    .replace(/[ψΨ]/g, 'ps').replace(/[ξΞ]/g, 'x').replace(/[σΣς]/g, 's')
    .replace(/[κΚ]/g, 'k').replace(/[λΛ]/g, 'l').replace(/[μΜ]/g, 'm')
    .replace(/[νΝ]/g, 'n').replace(/[πΠ]/g, 'p').replace(/[ρΡ]/g, 'r')
    .replace(/[τΤ]/g, 't').replace(/[φΦ]/g, 'f').replace(/[βΒ]/g, 'v')
    .replace(/[γΓ]/g, 'g').replace(/[δΔ]/g, 'd').replace(/[ζΖ]/g, 'z')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100)
}

// Walk an Elementor element tree and replace the HTML widget that holds the
// program page (identified by the "imx-page" wrapper class). Everything else
// on the page — e.g. the Bitform widget added manually after the HTML — is
// left untouched.
function replaceImxHtmlWidget(nodes: any[], html: string): boolean {
  for (const n of nodes) {
    if (n?.elType === 'widget' && n.widgetType === 'html' && typeof n.settings?.html === 'string' && n.settings.html.includes('imx-page')) {
      n.settings.html = html
      return true
    }
    if (Array.isArray(n?.elements) && replaceImxHtmlWidget(n.elements, html)) return true
  }
  return false
}

// Best-effort cache purge through our custom endpoint (see
// docs/wp-snippets/logistis-purge-cache.php). Never throws.
async function purgeWpPageCache(pageId: number): Promise<boolean> {
  if (!WP_URL || !WP_USER || !WP_PASS) return false
  try {
    const res = await fetch(`${WP_URL}/wp-json/logistis/v1/purge-cache`, {
      method: 'POST',
      headers: { Authorization: wpAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageId }),
    })
    return res.ok
  } catch { return false }
}

export interface PageProbe {
  status: number
  hasStamp: boolean
  hasImx: boolean          // the page contains an imx-page wrapper (any version)
  otherStamp: string | null // a different (older) render stamp found on the page
  cacheHeaders: string      // cache-related response headers, e.g. "cf-cache-status=HIT; age=312"
}

async function probePage(url: string, stamp: string): Promise<PageProbe | null> {
  try {
    const res = await fetch(url, { headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache', 'User-Agent': 'Mozilla/5.0 (compatible; imentor-sync-check)' }, redirect: 'follow' })
    const html = await res.text()
    const names = ['server', 'age', 'cf-cache-status', 'x-cache', 'x-litespeed-cache', 'x-lscache', 'x-wp-rocket', 'x-sg-cache', 'x-cache-status', 'x-proxy-cache', 'x-varnish', 'x-powered-by', 'cache-control']
    const cacheHeaders = names.map(n => [n, res.headers.get(n)] as const).filter(([, v]) => v).map(([n, v]) => `${n}=${v}`).join('; ')
    const m = html.match(/data-imx-render="(r[a-z0-9]+)"/)
    return {
      status: res.status,
      hasStamp: html.includes(stamp),
      hasImx: html.includes('imx-page'),
      otherStamp: m && m[1] !== stamp ? m[1] : null,
      cacheHeaders,
    }
  } catch { return null }
}

export interface UpdateWpPageResult {
  id: number
  link: string
  // The new HTML is stored in the page's Elementor data (re-read after saving).
  stored: boolean
  // The public page (cache-busted URL) serves the new HTML. null = could not check.
  live: boolean | null
  // The plain public URL serves it too. false while live=true means a page cache is serving the old version.
  liveCached: boolean | null
  purged: boolean
  // What the cache-busted public URL actually returned (for diagnosing live=false).
  probe: PageProbe | null
}

// Update an existing program page IN PLACE (same page ID, slug, status, menu
// entry and any other widgets). Only the HTML widget + SEO meta change.
// The result is VERIFIED: a unique render stamp is written into the HTML, then
// read back from WP storage and from the public page — "HTTP 200" alone has
// previously reported success while nothing visibly changed.
export async function updateWpPageHtml(pageId: number, opts: {
  html: string
  seoTitle: string
  metaDesc: string
  focusKeyword: string
  ogImageUrl?: string
}): Promise<UpdateWpPageResult> {
  const page = await wpFetch(`/pages/${pageId}?context=edit&_fields=id,link,meta`) as any
  const raw = page?.meta?._elementor_data
  if (!raw || typeof raw !== 'string') {
    throw new Error('Δεν διαβάστηκε το Elementor layout της σελίδας (meta _elementor_data μη προσβάσιμο) — δεν έγινε καμία αλλαγή.')
  }
  let tree: any[]
  try { tree = JSON.parse(raw) } catch { throw new Error('Μη έγκυρο Elementor JSON στη σελίδα — δεν έγινε καμία αλλαγή.') }

  const stamp = `r${Date.now().toString(36)}`
  const stampedHtml = opts.html.replace('class="imx-page"', `class="imx-page" data-imx-render="${stamp}"`)
  if (!replaceImxHtmlWidget(tree, stampedHtml)) {
    throw new Error('Η σελίδα δεν περιέχει το HTML widget του template (imx-page) — πιθανόν δημιουργήθηκε με άλλο τρόπο. Δεν έγινε καμία αλλαγή.')
  }
  const meta: Record<string, unknown> = {
    // Keep Elementor rendering this page from its builder data.
    _elementor_edit_mode: 'builder',
    _elementor_template_type: 'wp-page',
    _elementor_data: JSON.stringify(tree),
    _yoast_wpseo_title: opts.seoTitle,
    _yoast_wpseo_metadesc: opts.metaDesc,
    _yoast_wpseo_focuskw: opts.focusKeyword,
    '_yoast_wpseo_opengraph-title': opts.seoTitle,
    '_yoast_wpseo_opengraph-description': opts.metaDesc,
    rank_math_title: opts.seoTitle,
    rank_math_description: opts.metaDesc,
    rank_math_focus_keyword: opts.focusKeyword,
  }
  if (opts.ogImageUrl && /^https?:\/\//i.test(opts.ogImageUrl)) {
    meta['_yoast_wpseo_opengraph-image'] = opts.ogImageUrl
    meta.rank_math_og_content_image = opts.ogImageUrl
  }
  await wpFetch(`/pages/${pageId}`, {
    method: 'POST',
    body: JSON.stringify({ excerpt: opts.metaDesc, meta }),
  })

  // 1) Was it actually stored?
  const after = await wpFetch(`/pages/${pageId}?context=edit&_fields=id,link,meta`) as any
  const stored = typeof after?.meta?._elementor_data === 'string' && after.meta._elementor_data.includes(stamp)
  if (!stored) {
    throw new Error('Το WordPress απάντησε OK αλλά ΔΕΝ αποθήκευσε το νέο περιεχόμενο (το meta _elementor_data δεν ενημερώθηκε — πιθανόν δεν είναι εγγράψιμο μέσω REST). Δες το snippet στο docs/wp-snippets.')
  }

  // 2) Purge caches, then check what the public page really serves.
  const purged = await purgeWpPageCache(pageId)
  const link: string = after.link
  const sep = link.includes('?') ? '&' : '?'
  const probe = await probePage(`${link}${sep}imxv=${stamp}&nocache=${Date.now()}`, stamp)
  const live = probe ? probe.hasStamp : null
  const liveCached = live ? (await probePage(link, stamp))?.hasStamp ?? null : null
  return { id: pageId, link, stored, live, liveCached, purged, probe }
}

// Upload a file to the WP media library (idempotent per slug) and return its
// public URL. Needs the WP user to have the upload_files capability.
export async function uploadWpMedia(opts: {
  slug: string
  extension: string
  mimeType: string
  title: string
  data: Buffer
}): Promise<string> {
  const existing = await wpFetch(`/media?slug=${encodeURIComponent(opts.slug)}&_fields=id,source_url`) as any[]
  if (Array.isArray(existing) && existing[0]?.source_url) return existing[0].source_url as string
  if (!WP_URL || !WP_USER || !WP_PASS) throw new Error('WordPress env vars not configured')
  const filename = `${opts.slug}.${opts.extension}`
  const res = await fetch(`${WP_URL}/wp-json/wp/v2/media`, {
    method: 'POST',
    headers: {
      Authorization: wpAuth(),
      'Content-Type': opts.mimeType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
    body: new Uint8Array(opts.data),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`WP media API ${res.status}: ${text.slice(0, 200)}`)
  const created = JSON.parse(text)
  // Give it a readable title (best effort).
  try {
    await wpFetch(`/media/${created.id}`, { method: 'POST', body: JSON.stringify({ title: opts.title }) })
  } catch { /* non-fatal */ }
  return created.source_url as string
}

// Update the status of an existing WP page (publish / draft / private)
export async function setWpPageStatus(pageId: number, status: 'publish' | 'draft' | 'private'): Promise<void> {
  await wpFetch(`/pages/${pageId}`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  })
}

// Set or clear the _logistis_inactive meta flag on a WP page.
// Requires the "Logistis Inactive Notice" Code Snippet to be active on the WP site
// (registers the meta for REST and injects the top banner via wp_body_open).
export async function setWpPageInactiveMeta(pageId: number, inactive: boolean): Promise<void> {
  await wpFetch(`/pages/${pageId}`, {
    method: 'POST',
    body: JSON.stringify({ meta: { _logistis_inactive: inactive ? '1' : '' } }),
  })
}

// Remove a page from all WP nav menus via our custom Logistis REST endpoint.
// Requires the Code Snippet "logistis/v1/remove-menu-item" to be active on the WP site.
export async function removeWpMenuItem(pageId: number): Promise<void> {
  if (!WP_URL || !WP_USER || !WP_PASS) {
    throw new Error('WordPress env vars not configured')
  }
  const url = `${WP_URL}/wp-json/logistis/v1/remove-menu-item`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: wpAuth(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ pageId }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`WP remove-menu API ${res.status}: ${text.slice(0, 400)}`)
}

// Add a WP page as a child of a named menu item using our custom Logistis REST endpoint.
// Requires the Code Snippet "logistis/v1/add-menu-item" to be active on the WP site.
export async function addWpMenuItemAsChild(opts: {
  parentTitle: string
  pageId: number
  pageTitle: string
  menuName?: string
}): Promise<void> {
  if (!WP_URL || !WP_USER || !WP_PASS) {
    throw new Error('WordPress env vars not configured')
  }
  const url = `${WP_URL}/wp-json/logistis/v1/add-menu-item`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: wpAuth(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(opts),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`WP menu API ${res.status}: ${text.slice(0, 400)}`)
}

// Build replacement map from program fields
export function buildProgramReplacements(
  program: Record<string, unknown>,
  placeholderMap: Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = {}

  const formatPct = (v: unknown) => v != null ? `${v}%` : ''
  const formatEur = (v: unknown) => v != null ? `€${Number(v).toLocaleString('el-GR')}` : ''

  // Built-in derived values
  const derived: Record<string, string> = {
    title: String(program.title ?? ''),
    description: String(program.description ?? ''),
    category: String(program.category ?? ''),
    minInvestment: formatEur(program.minInvestment),
    maxInvestment: formatEur(program.maxInvestment),
    subsidyRange: program.minSubsidyPct != null && program.maxSubsidyPct != null
      ? `${program.minSubsidyPct}%–${program.maxSubsidyPct}%`
      : formatPct(program.maxSubsidyPct ?? program.minSubsidyPct),
    minSubsidyPct: formatPct(program.minSubsidyPct),
    maxSubsidyPct: formatPct(program.maxSubsidyPct),
    investmentRange: program.minInvestment != null && program.maxInvestment != null
      ? `${formatEur(program.minInvestment)}–${formatEur(program.maxInvestment)}`
      : formatEur(program.maxInvestment ?? program.minInvestment),
    otherRequirements: String(program.otherRequirements ?? ''),
    websiteUrl: String(program.websiteUrl ?? ''),
    totalBudget: formatEur(program.totalBudgetEur),
    implementationMonths: program.implementationMonths != null ? `${program.implementationMonths} μήνες` : '',
    endDate: program.endDate ? new Date(program.endDate as string).toLocaleDateString('el-GR') : '',
    heroImageUrl: String(program.heroImageUrl ?? ''),
    metaDescription: String(program.description ?? '').slice(0, 155),
    // ΔΥΠΑ hiring subsidy fields
    monthlyAmount: String(program.monthlyAmount ?? ''),
    subsidyMonths: String(program.subsidyMonths ?? ''),
    totalBenefit: String(program.totalBenefit ?? ''),
    beneficiaries: String(program.beneficiaries ?? ''),
    regions: String(program.regions ?? ''),
  }

  // Map each placeholder token to its resolved value
  for (const [token, fieldOrKey] of Object.entries(placeholderMap)) {
    result[token] = derived[fieldOrKey] ?? String((program as any)[fieldOrKey] ?? '')
  }

  return result
}
