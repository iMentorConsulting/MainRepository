import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createAuditLog } from '@/lib/audit'

// Records in-app page navigation so the admin audit page can show what
// accountants browsed. Fire-and-forget from the client; always returns ok.
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })

  const { path } = await request.json().catch(() => ({}))
  if (typeof path !== 'string' || !path.startsWith('/') || path.length > 300) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  await createAuditLog({
    userId: session.user.id,
    action: 'PAGE_VIEW',
    entity: 'Page',
    details: path,
  })

  return NextResponse.json({ ok: true })
}
