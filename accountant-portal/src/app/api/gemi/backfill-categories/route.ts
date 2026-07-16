import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEffectiveCategory } from '@/lib/business-categories'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Process in batches of 500
  const batchSize = 500
  let skip = 0
  let updated = 0

  while (true) {
    const records = await prisma.gemiLookup.findMany({
      where: { aadeEnriched: true, category: null },
      select: { id: true, tags: true, activities: true },
      skip,
      take: batchSize,
    })

    if (records.length === 0) break

    for (const r of records) {
      const activities = (Array.isArray(r.activities) ? r.activities : []) as { firmActCode?: string | null; firmActKind?: number | null }[]
      const cat = getEffectiveCategory({ tags: r.tags, activities }) ?? null
      if (cat) {
        await prisma.gemiLookup.update({ where: { id: r.id }, data: { category: cat } })
        updated++
      }
    }

    skip += batchSize
    if (records.length < batchSize) break
  }

  return NextResponse.json({ updated })
}
