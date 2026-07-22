import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { cloneElementorPage, buildProgramReplacements } from '@/lib/wordpress'

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
    prisma.wordpressTemplate.findUnique({ where: { id: templateId } }),
  ])

  if (!program) return NextResponse.json({ error: 'Program not found' }, { status: 404 })
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  const placeholderMap = (template.placeholders ?? {}) as Record<string, string>
  const replacements = buildProgramReplacements(program as unknown as Record<string, unknown>, placeholderMap)

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
    const { id: wpId, link } = await cloneElementorPage({
      templatePageId: template.wpPageId,
      newTitle: program.title,
      slug,
      replacements,
      status: 'draft',
    })

    await prisma.program.update({
      where: { id },
      data: { wpPageId: wpId, wpPageUrl: link },
    })

    return NextResponse.json({ wpPageId: wpId, wpPageUrl: link })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[WP] create-wp-page failed:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
