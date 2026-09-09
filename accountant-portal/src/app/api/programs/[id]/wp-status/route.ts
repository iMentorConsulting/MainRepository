import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { setWpPageStatus, setWpPageInactiveMeta, removeWpMenuItem } from '@/lib/wordpress'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const { status } = await request.json()

  if (!['publish', 'draft', 'private', 'inactive'].includes(status)) {
    return NextResponse.json({ error: 'status must be publish, draft, private, or inactive' }, { status: 400 })
  }

  const program = await prisma.program.findUnique({ where: { id }, select: { wpPageId: true } })
  if (!program) return NextResponse.json({ error: 'Program not found' }, { status: 404 })
  if (!program.wpPageId) return NextResponse.json({ error: 'No WP page linked to this program' }, { status: 400 })

  const pageId = program.wpPageId
  const warnings: string[] = []

  try {
    if (status === 'inactive') {
      // Keep page public for SEO; set inactive meta (triggers top banner via Code Snippet)
      // and remove from nav menu so new visitors don't find it through navigation.
      await setWpPageStatus(pageId, 'publish')
      await setWpPageInactiveMeta(pageId, true)
      try {
        await removeWpMenuItem(pageId)
      } catch (menuErr) {
        const msg = menuErr instanceof Error ? menuErr.message : String(menuErr)
        console.warn('[WP] remove-menu-item failed (non-fatal):', msg)
        warnings.push(`Η σελίδα απενεργοποιήθηκε αλλά η αφαίρεση από το μενού απέτυχε: ${msg}`)
      }
      return NextResponse.json({ ok: true, wpPageId: pageId, status, warnings })
    }

    if (status === 'publish') {
      // Reactivate: clear inactive meta (banner disappears), keep page published.
      // Menu re-entry is manual — use "Αντικατάσταση Σελίδας" if needed.
      await setWpPageStatus(pageId, 'publish')
      await setWpPageInactiveMeta(pageId, false)
      return NextResponse.json({ ok: true, wpPageId: pageId, status, warnings })
    }

    // draft / private — legacy behaviour
    await setWpPageStatus(pageId, status as 'draft' | 'private')
    return NextResponse.json({ ok: true, wpPageId: pageId, status })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[WP] wp-status update failed:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
