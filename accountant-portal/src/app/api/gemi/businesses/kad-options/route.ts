import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session || !['ADMIN', 'CONSULTANT'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rows = await prisma.$queryRaw<{ code: string; descr: string | null }[]>`
    SELECT DISTINCT
      elem->>'firmActCode' AS code,
      elem->>'firmActDescr' AS descr
    FROM "GemiLookup",
    jsonb_array_elements(activities::jsonb) AS elem
    WHERE elem->>'firmActCode' IS NOT NULL
      AND elem->>'firmActCode' != ''
    ORDER BY code
  `

  return NextResponse.json(rows.map(r => ({ code: r.code, descr: r.descr || r.code })))
}
