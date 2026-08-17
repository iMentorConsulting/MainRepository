import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { lookupAfm } from '@/lib/gsis'

// GET /api/admin/test-aade?afm=123456789
// Tests the current AADE credentials by doing a real lookup of the given AFM.
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const afm = request.nextUrl.searchParams.get('afm') || '094004695' // ΕΛΤΑ as default test AFM

  try {
    const data = await lookupAfm(afm)
    if (!data) {
      return NextResponse.json({ ok: false, error: 'No data returned — credentials may be wrong or AFM not found' })
    }
    return NextResponse.json({ ok: true, onomasia: data.onomasia, afm: data.afm, postalAreaDescription: data.postalAreaDescription })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Unknown error' })
  }
}
