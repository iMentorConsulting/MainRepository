import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  cloneElementorPage,
  createWpPageFromHtmlTemplate,
  buildProgramReplacements,
  addWpMenuItemAsChild,
} from '@/lib/wordpress'

function applyTokens(text: string, replacements: Record<string, string>): string {
  let result = text
  for (const [token, value] of Object.entries(replacements)) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    result = result.replace(new RegExp(escaped, 'g'), value)
  }
  return result
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const { templateId } = await request.json()

  if (!templateId) {
    return NextResponse.json({ error: 'templateId is required' }, { status: 400 })
  }

  const [program, template] = await Promise.all([
    prisma.program.findUnique({ where: { id } }),
    prisma.wordpressTemplate.findUnique({
      where: { id: templateId },
      select: {
        id: true,
        name: true,
        wpPageId: true,
        htmlTemplate: true,
        seoTitlePattern: true,
        metaDescPattern: true,
        placeholders: true,
        wpMenuParentTitle: true,
        wpMenuName: true,
      },
    }),
  ])

  if (!program) return NextResponse.json({ error: 'Program not found' }, { status: 404 })
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  const placeholderMap = (template.placeholders ?? {}) as Record<string, string>
  const replacements = buildProgramReplacements(program as unknown as Record<string, unknown>, placeholderMap)

  const tokenCount = Object.keys(replacements).length
  const emptyValueTokens = Object.entries(replacements).filter(([, v]) => !v).map(([k]) => k)
  console.log(`[WP] template "${template.name}" placeholderMap keys: ${Object.keys(placeholderMap).join(', ') || '(none)'}`)
  console.log(`[WP] replacements built: ${tokenCount} tokens. Empty values: ${emptyValueTokens.join(', ') || 'none'}`)
  if (tokenCount === 0) {
    console.warn(`[WP] WARNING: zero replacements for templateId=${templateId} — placeholders may be empty in DB`)
  }

  // Slug: slugify the title (Greek-safe — keep only alphanumeric + hyphens)
  const slug = program.title
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

  try {
    let wpId: number
    let link: string

    if (template.htmlTemplate) {
      // HTML template mode: build a fresh WP page with a single Elementor HTML widget
      const htmlContent = applyTokens(template.htmlTemplate, replacements)
      const seoTitleRaw = template.seoTitlePattern || '{{TITLE}} | i-Mentor Consulting'
      const metaDescRaw = template.metaDescPattern || '{{DESCRIPTION}}'
      const seoTitle = applyTokens(seoTitleRaw, replacements)
      const metaDesc = applyTokens(metaDescRaw, replacements).slice(0, 160)
      const focusKeyword = program.title

      const result = await createWpPageFromHtmlTemplate({
        title: program.title,
        slug,
        htmlContent,
        seoTitle,
        metaDesc,
        focusKeyword,
        ogImageUrl: (program.heroImageUrl as string | null) ?? undefined,
        status: 'publish',
      })
      wpId = result.id
      link = result.link
    } else {
      // Clone mode: clone an existing WP page's Elementor layout
      if (!template.wpPageId) {
        return NextResponse.json({ error: 'Template has neither htmlTemplate nor wpPageId' }, { status: 400 })
      }
      const result = await cloneElementorPage({
        templatePageId: template.wpPageId,
        newTitle: program.title,
        slug,
        replacements,
        status: 'publish',
      })
      wpId = result.id
      link = result.link
    }

    await prisma.program.update({
      where: { id },
      data: { wpPageId: wpId, wpPageUrl: link },
    })

    // Add to WP nav menu if template specifies a parent menu item
    let menuWarning: string | undefined
    const parentTitle = template.wpMenuParentTitle ?? null
    const menuName = template.wpMenuName ?? null
    console.log(`[WP] wpMenuParentTitle="${parentTitle}" wpMenuName="${menuName}" templateId=${templateId}`)
    if (parentTitle) {
      try {
        await addWpMenuItemAsChild({
          parentTitle,
          pageId: wpId,
          pageTitle: program.title,
          ...(menuName ? { menuName } : {}),
        })
        console.log(`[WP] menu item added successfully under "${parentTitle}"${menuName ? ` in menu "${menuName}"` : ''}`)
      } catch (menuErr) {
        const msg = menuErr instanceof Error ? menuErr.message : String(menuErr)
        console.error('[WP] menu placement failed:', msg)
        menuWarning = `Σελίδα δημοσιεύτηκε αλλά αποτυχία προσθήκης στο μενού: ${msg}`
      }
    }

    return NextResponse.json({ wpPageId: wpId, wpPageUrl: link, menuWarning, tokenCount, emptyValueTokens })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[WP] create-wp-page failed:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
