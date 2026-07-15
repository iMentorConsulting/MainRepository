import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST /api/admin/setup-exodikastikos-commission
// Creates or updates the 5% commission policy for ΕΞΩΔΙΚΑΣΤΙΚΟΣ ΜΗΧΑΝΙΣΜΟΣ
// covering both APPLICATION and IMPLEMENTATION stages.
export async function POST() {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Find or create the ΕΞΩΔΙΚΑΣΤΙΚΟΣ service
  let service = await prisma.service.findFirst({
    where: { name: { contains: 'ΕΞΩΔΙΚΑΣΤ' } },
  })

  if (!service) {
    service = await prisma.service.create({
      data: {
        name: 'ΕΞΩΔΙΚΑΣΤΙΚΟΣ ΜΗΧΑΝΙΣΜΟΣ',
        description: 'Εξωδικαστικός Μηχανισμός Ρύθμισης Οφειλών',
        price: 0,
        currency: 'eur',
        active: true,
      },
    })
  }

  // Deactivate any existing policies for this service to avoid duplicates
  await prisma.commissionPolicy.updateMany({
    where: { serviceId: service.id },
    data: { active: false },
  })

  // Create the 5% policy covering both stages
  const policy = await prisma.commissionPolicy.create({
    data: {
      name: 'ΕΞΩΔΙΚΑΣΤΙΚΟΣ 5%',
      description: 'Σταθερή προμήθεια 5% επί της αμοιβής πελάτη — αίτηση & υλοποίηση',
      commissionType: 'PERCENTAGE',
      percentage: 5,
      appliesToApplication: true,
      appliesToImplementation: true,
      serviceId: service.id,
      active: true,
    },
    include: {
      service: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json({
    message: 'Η πολιτική προμήθειας 5% για ΕΞΩΔΙΚΑΣΤΙΚΟΣ δημιουργήθηκε επιτυχώς',
    service: { id: service.id, name: service.name },
    policy: {
      id: policy.id,
      name: policy.name,
      percentage: policy.percentage,
      appliesToApplication: policy.appliesToApplication,
      appliesToImplementation: policy.appliesToImplementation,
    },
  })
}
