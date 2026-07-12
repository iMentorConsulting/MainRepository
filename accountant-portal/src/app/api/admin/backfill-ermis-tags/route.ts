import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST /api/admin/backfill-ermis-tags
// One-time backfill: for every BusinessLeadInterest row, ensure the program name
// is a TagOption and is present on Business.tags.
export async function POST() {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const interests = await prisma.businessLeadInterest.findMany({
    select: { businessId: true, program: true },
  })

  // Collect unique program names
  const allTags = Array.from(new Set(interests.map(i => i.program.trim()).filter(Boolean)))

  // Ensure TagOption exists for each
  for (const tag of allTags) {
    const exists = await prisma.tagOption.findFirst({ where: { label: tag } })
    if (!exists) {
      const count = await prisma.tagOption.count()
      await prisma.tagOption.create({ data: { label: tag, order: count } })
    }
  }

  // Group by businessId
  const byBusiness = new Map<string, Set<string>>()
  for (const { businessId, program } of interests) {
    const tag = program.trim()
    if (!tag) continue
    if (!byBusiness.has(businessId)) byBusiness.set(businessId, new Set())
    byBusiness.get(businessId)!.add(tag)
  }

  let updated = 0
  for (const [businessId, newTags] of Array.from(byBusiness)) {
    const biz = await prisma.business.findUnique({ where: { id: businessId }, select: { tags: true } })
    if (!biz) continue
    const merged = Array.from(new Set([...biz.tags, ...Array.from(newTags)]))
    if (merged.length !== biz.tags.length) {
      await prisma.business.update({ where: { id: businessId }, data: { tags: merged } })
      updated++
    }
  }

  return NextResponse.json({ tagOptions: allTags.length, businessesUpdated: updated })
}
