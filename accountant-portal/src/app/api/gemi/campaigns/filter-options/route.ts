import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { GREEK_REGIONS } from '@/lib/greek-regions'

export async function GET(_req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [categoryRows, importBatchRows, tagRows] = await Promise.all([
    prisma.gemiLookup.findMany({
      where: { category: { not: null } },
      select: { category: true },
      distinct: ['category'],
      orderBy: { category: 'asc' },
    }),
    prisma.gemiLookup.findMany({
      where: { importBatch: { not: null } },
      select: { importBatch: true },
      distinct: ['importBatch'],
      orderBy: { importBatch: 'desc' },
    }),
    prisma.$queryRaw<{ tag: string }[]>`
      SELECT DISTINCT unnest(tags) AS tag
      FROM "GemiLookup"
      WHERE cardinality(tags) > 0
      ORDER BY tag
    `,
  ])

  return NextResponse.json({
    // The 13 official Greek administrative regions — previously this listed
    // distinct postalAreaDescription values instead, which are Δήμοι (e.g.
    // "ΑΒΔΗΡΑ"), not Περιφέρειες, and the filter didn't actually group by
    // region at all. See regionWhereClause() for the matching postal-code-based
    // filter applied when a region is selected.
    regions: [...GREEK_REGIONS],
    categories: categoryRows.map(r => r.category as string),
    importBatches: importBatchRows.map(r => r.importBatch as string),
    tags: tagRows.map(r => r.tag),
  })
}
