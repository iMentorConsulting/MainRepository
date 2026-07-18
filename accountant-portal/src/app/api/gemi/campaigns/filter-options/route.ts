import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(_req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [regionRows, categoryRows, importBatchRows] = await Promise.all([
    prisma.gemiLookup.findMany({
      where: { postalAreaDescription: { not: null } },
      select: { postalAreaDescription: true },
      distinct: ['postalAreaDescription'],
      orderBy: { postalAreaDescription: 'asc' },
    }),
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
  ])

  return NextResponse.json({
    regions: regionRows.map(r => r.postalAreaDescription as string),
    categories: categoryRows.map(r => r.category as string),
    importBatches: importBatchRows.map(r => r.importBatch as string),
  })
}
