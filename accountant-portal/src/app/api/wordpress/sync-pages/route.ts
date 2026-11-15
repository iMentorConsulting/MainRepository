import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { updateWpPageHtml } from '@/lib/wordpress'
import { BUILTIN_V2_TEMPLATE_ID } from '@/lib/wp-program-page'
import { resolveV2Template, renderV2ForProgram } from '@/lib/wp-template-resolver'

export const maxDuration = 300

// Bulk "Συγχρονισμός": re-render every program that has a WP page with a v2
// template, in place. Sequential, per-program errors are collected and never
// abort the run. Body: { templateId?, programIds?, includeArchived? }
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await request.json().catch(() => ({}))
  const templateId: string = body.templateId || BUILTIN_V2_TEMPLATE_ID
  const programIds: string[] | undefined = Array.isArray(body.programIds) ? body.programIds : undefined

  const programs = await prisma.program.findMany({
    where: {
      wpPageId: { not: null },
      ...(programIds ? { id: { in: programIds } } : {}),
      ...(body.includeArchived ? {} : { archived: false }),
    },
    select: { id: true, title: true, wpPageId: true, category: true, heroImageUrl: true },
    orderBy: { title: 'asc' },
  })

  const results: { id: string; title: string; ok: boolean; error?: string; warnings?: string[] }[] = []
  for (const p of programs) {
    try {
      const tpl = await resolveV2Template(templateId, p.category)
      if (!tpl) throw new Error('Το template δεν είναι v2 (πλούσιο) template')
      const rendered = await renderV2ForProgram(p.id, tpl)
      if (!rendered) throw new Error('Program not found')
      const r = await updateWpPageHtml(p.wpPageId!, {
        html: rendered.html,
        seoTitle: rendered.seoTitle,
        metaDesc: rendered.metaDesc,
        focusKeyword: p.title,
        ogImageUrl: p.heroImageUrl ?? undefined,
      })
      await prisma.program.update({ where: { id: p.id }, data: { wpPageUrl: r.link } })
      const w = [...rendered.warnings]
      if (r.live === false) w.push('η δημόσια σελίδα δεν δείχνει ακόμα το νέο περιεχόμενο')
      else if (r.live && r.liveCached === false) w.push('page cache σερβίρει παλιά έκδοση')
      results.push({ id: p.id, title: p.title, ok: true, warnings: w })
    } catch (e) {
      results.push({ id: p.id, title: p.title, ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return NextResponse.json({ total: results.length, updated: results.filter(r => r.ok).length, results })
}
