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

// Update the status of an existing WP page (publish / draft / private)
export async function setWpPageStatus(pageId: number, status: 'publish' | 'draft' | 'private'): Promise<void> {
  await wpFetch(`/pages/${pageId}`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  })
}

// Add a WP page as a child of a named menu item using our custom Logistis REST endpoint.
// Requires the Code Snippet "logistis/v1/add-menu-item" to be active on the WP site.
export async function addWpMenuItemAsChild(opts: {
  parentTitle: string
  pageId: number
  pageTitle: string
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
  }

  // Map each placeholder token to its resolved value
  for (const [token, fieldOrKey] of Object.entries(placeholderMap)) {
    result[token] = derived[fieldOrKey] ?? String((program as any)[fieldOrKey] ?? '')
  }

  return result
}
