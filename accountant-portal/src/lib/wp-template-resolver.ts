// Resolves a template id to a "v2" (rich, data-driven) template, if it is one.
// Returns null for legacy templates so the original flow runs untouched.
import { prisma } from '@/lib/prisma'
import { WP_V2_MARKER, BUILTIN_V2_TEMPLATE_ID } from '@/lib/wp-program-page'
import { WP_TEMPLATE_V2_HTML, WP_TEMPLATE_V2_NAME } from '@/lib/wp-template-v2'

export interface V2Template {
  id: string
  name: string
  html: string
  seoTitlePattern: string | null
  metaDescPattern: string | null
  wpMenuParentTitle: string | null
  wpMenuName: string | null
}

export const BUILTIN_V2_LISTING = {
  id: BUILTIN_V2_TEMPLATE_ID,
  name: WP_TEMPLATE_V2_NAME,
  categories: [] as string[],
  builtin: true,
}

export async function resolveV2Template(templateId: string | null | undefined, category?: string): Promise<V2Template | null> {
  if (!templateId) return null
  if (templateId === BUILTIN_V2_TEMPLATE_ID) {
    // The built-in template has no menu settings of its own: reuse the menu
    // placement of an existing template for this program category.
    const candidates = await prisma.wordpressTemplate.findMany({
      where: { active: true, wpMenuParentTitle: { not: null } },
      select: { wpMenuParentTitle: true, wpMenuName: true, categories: true },
      orderBy: { createdAt: 'desc' },
    })
    const menu = candidates.find(c => category && c.categories.includes(category)) ?? candidates.find(c => c.categories.length === 0) ?? null
    return {
      id: templateId,
      name: WP_TEMPLATE_V2_NAME,
      html: WP_TEMPLATE_V2_HTML,
      seoTitlePattern: null,
      metaDescPattern: null,
      wpMenuParentTitle: menu?.wpMenuParentTitle ?? null,
      wpMenuName: menu?.wpMenuName ?? null,
    }
  }
  const t = await prisma.wordpressTemplate.findUnique({ where: { id: templateId } })
  if (!t?.htmlTemplate?.includes(WP_V2_MARKER)) return null
  return {
    id: t.id,
    name: t.name,
    html: t.htmlTemplate,
    seoTitlePattern: t.seoTitlePattern,
    metaDescPattern: t.metaDescPattern,
    wpMenuParentTitle: t.wpMenuParentTitle,
    wpMenuName: t.wpMenuName,
  }
}

import { buildProgramPage, loadProgramPageInput, renderProgramHtml, renderSeoText } from '@/lib/wp-program-page'

// Loads the program, renders the v2 template and derives the SEO fields.
export async function renderV2ForProgram(programId: string, tpl: V2Template) {
  const loaded = await loadProgramPageInput(programId)
  if (!loaded) return null
  const page = buildProgramPage(loaded.input)
  return {
    program: loaded.input.program,
    html: renderProgramHtml(tpl.html, page),
    seoTitle: renderSeoText(tpl.seoTitlePattern, page, page.seoTitle),
    metaDesc: renderSeoText(tpl.metaDescPattern, page, page.metaDesc).slice(0, 160),
    warnings: loaded.warnings,
  }
}
