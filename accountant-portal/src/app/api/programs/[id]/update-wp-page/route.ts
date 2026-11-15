import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { updateWpPageHtml } from '@/lib/wordpress'
import { BUILTIN_V2_TEMPLATE_ID } from '@/lib/wp-program-page'
import { resolveV2Template, renderV2ForProgram } from '@/lib/wp-template-resolver'

// Re-renders a program's EXISTING WordPress page with a v2 template, in place
// (same page ID / slug / status / menu entry; other widgets such as the
// Bitform are preserved).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const templateId: string = body.templateId || BUILTIN_V2_TEMPLATE_ID

  const program = await prisma.program.findUnique({ where: { id }, select: { wpPageId: true, category: true, title: true, heroImageUrl: true } })
  if (!program) return NextResponse.json({ error: 'Program not found' }, { status: 404 })
  if (!program.wpPageId) return NextResponse.json({ error: 'Το πρόγραμμα δεν έχει συνδεδεμένη σελίδα WordPress' }, { status: 400 })

  const tpl = await resolveV2Template(templateId, program.category)
  if (!tpl) return NextResponse.json({ error: 'Το template δεν είναι v2 (πλούσιο) template' }, { status: 400 })

  try {
    const rendered = await renderV2ForProgram(id, tpl)
    if (!rendered) return NextResponse.json({ error: 'Program not found' }, { status: 404 })
    const result = await updateWpPageHtml(program.wpPageId, {
      html: rendered.html,
      seoTitle: rendered.seoTitle,
      metaDesc: rendered.metaDesc,
      focusKeyword: program.title,
      ogImageUrl: program.heroImageUrl ?? undefined,
    })
    await prisma.program.update({ where: { id }, data: { wpPageUrl: result.link } })
    return NextResponse.json({ ok: true, wpPageId: result.id, wpPageUrl: result.link, warnings: rendered.warnings, stored: result.stored, live: result.live, liveCached: result.liveCached, purged: result.purged, probe: result.probe })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[WP] update-wp-page failed:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
