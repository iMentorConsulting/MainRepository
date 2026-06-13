import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { encrypt } from '@/lib/crypto'
import { pushExodikastikosCase } from '@/lib/exodikastikos-sync'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isAdmin = session.user.role === 'ADMIN'
  const where: any = {}
  if (!isAdmin) {
    if (!session.user.accountantId) return NextResponse.json({ cases: [] })
    where.accountantId = session.user.accountantId
  } else {
    const { searchParams } = request.nextUrl
    const statuses = (searchParams.get('statuses') || '').split(',').filter(Boolean)
    const accountantIds = (searchParams.get('accountantIds') || '').split(',').filter(Boolean)
    if (statuses.length) where.status = { in: statuses }
    if (accountantIds.length) where.accountantId = { in: accountantIds }
  }

  const cases = await prisma.exodikastikosCase.findMany({
    where,
    select: {
      id: true, caseNumber: true, status: true, resultLink: true, createdAt: true,
      accountant: { select: { id: true, officeName: true } },
      business: { select: { id: true, afm: true, onomasia: true, clientType: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const accountants = isAdmin
    ? await prisma.accountant.findMany({ select: { id: true, officeName: true }, orderBy: { officeName: 'asc' } })
    : []

  return NextResponse.json({ cases, accountants })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const data = await request.json()
  const {
    businessId, newClient, questionnaire, notes,
    hasSpouse,
    taxisnetUsername, taxisnetPassword,
    spouseTaxisnetUsername, spouseTaxisnetPassword,
  } = data

  let business
  if (newClient) {
    if (!newClient.afm || !newClient.onomasia) {
      return NextResponse.json({ error: 'ΑΦΜ και ονοματεπώνυμο/επωνυμία είναι υποχρεωτικά' }, { status: 400 })
    }
    const existing = await prisma.business.findUnique({ where: { afm: newClient.afm } })
    if (existing) {
      return NextResponse.json({ error: `Υπάρχει ήδη πελάτης με ΑΦΜ ${newClient.afm}` }, { status: 400 })
    }
    business = await prisma.business.create({
      data: {
        afm: newClient.afm,
        onomasia: newClient.onomasia,
        clientType: newClient.clientType === 'INDIVIDUAL' ? 'INDIVIDUAL' : 'BUSINESS',
        email: newClient.email || null,
        phone: newClient.phone || null,
        accountantId: session.user.role === 'ACCOUNTANT' ? session.user.accountantId : (newClient.accountantId || null),
        source: 'exodikastikos',
      },
    })
    await createAuditLog({
      userId: session.user.id, action: 'CREATE', entity: 'Business', entityId: business.id,
      details: `Created client ${business.afm} via Εξωδικαστικός referral`,
    })
  } else {
    if (!businessId) return NextResponse.json({ error: 'Ο πελάτης είναι υποχρεωτικός' }, { status: 400 })
    business = await prisma.business.findUnique({ where: { id: businessId } })
    if (!business) return NextResponse.json({ error: 'Δεν βρέθηκε ο πελάτης' }, { status: 404 })
  }

  const accountantId = session.user.role === 'ACCOUNTANT' ? session.user.accountantId : (business.accountantId || null)

  const created = await prisma.exodikastikosCase.create({
    data: {
      businessId: business.id,
      accountantId,
      questionnaire: questionnaire || undefined,
      notes: notes || null,
      hasSpouse: !!hasSpouse,
      taxisnetUsernameEnc: taxisnetUsername ? encrypt(taxisnetUsername) : null,
      taxisnetPasswordEnc: taxisnetPassword ? encrypt(taxisnetPassword) : null,
      spouseTaxisnetUsernameEnc: hasSpouse && spouseTaxisnetUsername ? encrypt(spouseTaxisnetUsername) : null,
      spouseTaxisnetPasswordEnc: hasSpouse && spouseTaxisnetPassword ? encrypt(spouseTaxisnetPassword) : null,
      createdById: session.user.id,
      activities: {
        create: {
          type: 'SUBMITTED',
          body: 'Η αίτηση υποβλήθηκε για δωρεάν εκτίμηση.',
          authorId: session.user.id,
          authorName: session.user.name || 'Σύστημα',
        },
      },
    },
    select: { id: true, caseNumber: true },
  })

  await createAuditLog({
    userId: session.user.id, action: 'CREATE', entity: 'ExodikastikosCase', entityId: created.id,
    details: `Created εξωδικαστικός referral for business ${business.afm}`,
  })

  pushExodikastikosCase(created.id).catch(err => console.error('[Exodikastikos] Sync failed:', err?.message))

  return NextResponse.json(created, { status: 201 })
}
