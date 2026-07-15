import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST /api/admin/setup-exodikastikos-commission
// Sets a fixed 5% commission for ΕΞΩΔΙΚΑΣΤΙΚΟΣ — both APPLICATION and IMPLEMENTATION.
// Safe to call multiple times.
export async function POST() {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const SERVICE_NAME = 'ΕΞΩΔΙΚΑΣΤΙΚΟΣ'
  const stem = SERVICE_NAME.substring(0, 6) // 'ΕΞΩΔΙΚ'

  // Find or create service with the exact name Finance payments use
  let service = await prisma.service.findFirst({
    where: { name: { equals: SERVICE_NAME, mode: 'insensitive' } },
  })
  if (!service) {
    service = await prisma.service.create({
      data: { name: SERVICE_NAME, price: 0, currency: 'eur', active: true },
    })
  }

  // Deactivate ALL existing active policies that would match this service via findApplicablePolicy:
  // — policies linked to this service by ID
  // — policies whose name contains the stem (these are caught by step-2 in findApplicablePolicy)
  await prisma.commissionPolicy.updateMany({
    where: {
      active: true,
      OR: [
        { serviceId: service.id },
        { name: { contains: stem, mode: 'insensitive' } },
      ],
    },
    data: { active: false },
  })

  // Create the definitive 5% policy, linked to the service by ID so step-1 always finds it first
  const policy = await prisma.commissionPolicy.create({
    data: {
      name: `${SERVICE_NAME} 5%`,
      description: 'Σταθερή προμήθεια 5% — αίτηση & υλοποίηση',
      commissionType: 'PERCENTAGE',
      percentage: 5,
      appliesToApplication: true,
      appliesToImplementation: true,
      serviceId: service.id,
      active: true,
    },
  })

  return NextResponse.json({
    ok: true,
    message: '5% commission policy for ΕΞΩΔΙΚΑΣΤΙΚΟΣ activated',
    serviceId: service.id,
    policyId: policy.id,
  })
}
