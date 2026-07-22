import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { listWpPages } from '@/lib/wordpress'

export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const pages = await listWpPages(100)
    return NextResponse.json(pages)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
