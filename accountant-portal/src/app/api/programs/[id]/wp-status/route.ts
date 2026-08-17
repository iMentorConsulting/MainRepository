import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { setWpPageStatus } from '@/lib/wordpress'

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

  if (!['publish', 'draft', 'private'].includes(status)) {
    return NextResponse.json({ error: 'status must be publish, draft, or private' }, { status: 400 })
  }

  const program = await prisma.program.findUnique({ where: { id }, select: { wpPageId: true } })
  if (!program) return NextResponse.json({ error: 'Program not found' }, { status: 404 })
  if (!program.wpPageId) return NextResponse.json({ error: 'No WP page linked to this program' }, { status: 400 })

  try {
    await setWpPageStatus(program.wpPageId, status as 'publish' | 'draft' | 'private')
    return NextResponse.json({ ok: true, wpPageId: program.wpPageId, status })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[WP] wp-status update failed:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
