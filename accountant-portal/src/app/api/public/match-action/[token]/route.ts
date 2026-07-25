import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

type Params = { params: Promise<{ token: string }> }

// GET — return program + accountant name + matched businesses (no contact info exposed)
export async function GET(_req: NextRequest, { params }: Params) {
  const { token } = await params

  const row = await prisma.matchActionToken.findUnique({
    where: { token },
    include: {
      accountant: { select: { id: true, contactPerson: true, officeName: true } },
      program: { select: { id: true, title: true, description: true, otherRequirements: true, endDate: true, maxSubsidyPct: true, minSubsidyPct: true } },
    },
  })

  if (!row) return NextResponse.json({ error: 'Ο σύνδεσμος δεν ισχύει.' }, { status: 404 })
  if (row.expiresAt < new Date()) return NextResponse.json({ error: 'Ο σύνδεσμος έχει λήξει.' }, { status: 410 })

  const matches = await prisma.programMatch.findMany({
    where: {
      programId: row.programId,
      business: { accountantId: row.accountantId },
      status: { not: 'REJECTED' },
    },
    include: {
      business: { select: { id: true, onomasia: true, afm: true, email: true, phone: true } },
    },
    orderBy: { business: { onomasia: 'asc' } },
  })

  // Check if a ClientCase (CONTACT_CLIENT) already exists for each business+program
  const existingCases = await prisma.clientCase.findMany({
    where: {
      programId: row.programId,
      accountantId: row.accountantId,
      requestType: 'CONTACT_CLIENT',
    },
    select: { businessId: true },
  })
  const alreadyAssigned = new Set(existingCases.map(c => c.businessId))

  const businesses = matches.map(m => ({
    id: m.business.id,
    onomasia: m.business.onomasia,
    afm: m.business.afm,
    hasEmail: !!m.business.email,
    hasPhone: !!m.business.phone,
    hasContactInfo: !!(m.business.email || m.business.phone),
    alreadyAssigned: alreadyAssigned.has(m.business.id),
  }))

  const withContact = businesses.filter(b => b.hasContactInfo && !b.alreadyAssigned).length
  const withoutContact = businesses.filter(b => !b.hasContactInfo && !b.alreadyAssigned).length

  return NextResponse.json({
    accountant: row.accountant,
    program: row.program,
    businesses,
    stats: { total: businesses.length, withContact, withoutContact, alreadyAssigned: alreadyAssigned.size },
  })
}

// POST — submit selections: create ClientCases, optionally save contact info
export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params

  const row = await prisma.matchActionToken.findUnique({
    where: { token },
    select: { accountantId: true, programId: true, expiresAt: true },
  })

  if (!row) return NextResponse.json({ error: 'Ο σύνδεσμος δεν ισχύει.' }, { status: 404 })
  if (row.expiresAt < new Date()) return NextResponse.json({ error: 'Ο σύνδεσμος έχει λήξει.' }, { status: 410 })

  const body = await req.json().catch(() => ({}))
  // selections: Array<{ businessId: string, email?: string, phone?: string }>
  const selections: Array<{ businessId: string; email?: string; phone?: string }> = Array.isArray(body.selections) ? body.selections : []

  if (selections.length === 0) return NextResponse.json({ created: 0 })

  // Verify all businesses belong to this accountant + are matched to this program
  const validMatches = await prisma.programMatch.findMany({
    where: {
      programId: row.programId,
      businessId: { in: selections.map(s => s.businessId) },
      business: { accountantId: row.accountantId },
      status: { not: 'REJECTED' },
    },
    select: { businessId: true },
  })
  const validIds = new Set(validMatches.map(m => m.businessId))

  // Existing cases to avoid duplicates
  const existing = await prisma.clientCase.findMany({
    where: {
      programId: row.programId,
      accountantId: row.accountantId,
      requestType: 'CONTACT_CLIENT',
      businessId: { in: Array.from(validIds) },
    },
    select: { businessId: true },
  })
  const existingIds = new Set(existing.map(c => c.businessId))

  let created = 0
  let contactsUpdated = 0

  for (const sel of selections) {
    if (!validIds.has(sel.businessId)) continue
    if (existingIds.has(sel.businessId)) continue

    // Save contact info if provided
    const emailTrimmed = sel.email?.trim() || null
    const phoneTrimmed = sel.phone?.trim() || null
    if (emailTrimmed || phoneTrimmed) {
      await prisma.business.update({
        where: { id: sel.businessId },
        data: {
          ...(emailTrimmed ? { email: emailTrimmed } : {}),
          ...(phoneTrimmed ? { phone: phoneTrimmed } : {}),
        },
      })
      contactsUpdated++
    }

    // Verify the business now has at least one contact method
    const biz = await prisma.business.findUnique({
      where: { id: sel.businessId },
      select: { email: true, phone: true, onomasia: true, afm: true },
    })
    if (!biz?.email && !biz?.phone) continue // still no contact info — skip

    await prisma.clientCase.create({
      data: {
        accountantId: row.accountantId,
        businessId: sel.businessId,
        programId: row.programId,
        requestType: 'CONTACT_CLIENT',
        title: `Ενημέρωση πελάτη — ${biz.onomasia || biz.afm}`,
        status: 'NEW',
        createdById: row.accountantId,
      },
    })
    created++
  }

  return NextResponse.json({ created, contactsUpdated })
}
