import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST /api/finance-payments/sync-services
// Bulk-populates Business.iMentorServices from all Finance payments that have a matched business.
export async function POST() {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const payments = await prisma.financePayment.findMany({
    where: { businessId: { not: null } },
    select: { businessId: true, serviceName: true },
  })

  // Group services by businessId
  const map = new Map<string, Set<string>>()
  for (const p of payments) {
    if (!p.businessId) continue
    if (!map.has(p.businessId)) map.set(p.businessId, new Set())
    map.get(p.businessId)!.add(p.serviceName)
  }

  let updated = 0
  for (const [businessId, services] of Array.from(map.entries())) {
    const business = await prisma.business.findUnique({ where: { id: businessId }, select: { iMentorServices: true } })
    if (!business) continue
    const merged = Array.from(new Set([...business.iMentorServices, ...Array.from(services)]))
    if (merged.length !== business.iMentorServices.length || merged.some(s => !business.iMentorServices.includes(s))) {
      await prisma.business.update({ where: { id: businessId }, data: { iMentorServices: merged } })
      updated++
    }
  }

  return NextResponse.json({ updated })
}
