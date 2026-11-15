import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { patchWpPageFormSection } from '@/lib/wordpress'

export const maxDuration = 300

// Bulk: slims down the intro above the Bitform and moves the #form anchor to
// the very end of the HTML, on every linked WP page (any template version).
// Body: { programIds?, excludeArchived? }. Sequential; per-page errors never
// abort the run. Pages already compact are skipped.
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await request.json().catch(() => ({}))
  const programIds: string[] | undefined = Array.isArray(body.programIds) ? body.programIds : undefined

  const programs = await prisma.program.findMany({
    where: {
      wpPageId: { not: null },
      ...(programIds ? { id: { in: programIds } } : {}),
      ...(body.excludeArchived ? { archived: false } : {}),
    },
    select: { id: true, title: true, wpPageId: true },
    orderBy: { title: 'asc' },
  })

  const results: { id: string; title: string; status: 'patched' | 'already-compact' | 'no-form-section' | 'failed'; note?: string }[] = []
  for (const p of programs) {
    try {
      const r = await patchWpPageFormSection(p.wpPageId!)
      if (!r.patched) { results.push({ id: p.id, title: p.title, status: r.skipped }); continue }
      let note: string | undefined
      if (r.live === false) note = 'η δημόσια σελίδα δεν δείχνει ακόμα την αλλαγή (cache)'
      else if (r.live && r.liveCached === false) note = 'page cache σερβίρει παλιά έκδοση'
      results.push({ id: p.id, title: p.title, status: 'patched', note })
    } catch (e) {
      results.push({ id: p.id, title: p.title, status: 'failed', note: e instanceof Error ? e.message : String(e) })
    }
  }
  const count = (s: string) => results.filter(r => r.status === s).length
  return NextResponse.json({
    total: results.length,
    patched: count('patched'),
    alreadyCompact: count('already-compact'),
    noFormSection: count('no-form-section'),
    failed: count('failed'),
    results,
  })
}
