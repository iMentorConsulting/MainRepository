import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import { notifyCaseManagement } from '@/lib/case-management-sync'
import { buildBusinessProfilePayload, BUSINESS_PROFILE_SELECT } from '@/lib/business-profile'

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
    include: {
      accountant: { select: { id: true, officeName: true, contactPerson: true } },
      program: { select: { id: true, title: true } },
    },
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
  const createdCases: Array<{ caseNumber: number; businessName: string; caseId: string }> = []

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

    // Fetch full business profile (needed for contact check + CM notification)
    const biz = await prisma.business.findUnique({
      where: { id: sel.businessId },
      select: { email: true, phone: true, ...BUSINESS_PROFILE_SELECT },
    })
    if (!biz?.email && !biz?.phone) continue // still no contact info — skip

    const caseTitle = `Ενημέρωση πελάτη — ${biz.onomasia || biz.afm}`
    const clientCase = await prisma.clientCase.create({
      data: {
        accountantId: row.accountantId,
        businessId: sel.businessId,
        programId: row.programId,
        requestType: 'CONTACT_CLIENT',
        title: caseTitle,
        status: 'NEW',
        createdById: row.accountantId,
      },
      select: { id: true, caseNumber: true },
    })
    created++
    createdCases.push({ caseNumber: clientCase.caseNumber, businessName: biz.onomasia || biz.afm, caseId: clientCase.id })

    // Notify case management system per case (same as /api/cases POST)
    const profile = await buildBusinessProfilePayload(biz)
    notifyCaseManagement({
      caseNumber: clientCase.caseNumber,
      phone: biz.phone || null,
      email: biz.email || null,
      accountantOffice: row.accountant.officeName || null,
      caseType: null,
      description: `Ανάθεση από λογιστή μέσω action page — ${row.program.title}`,
      priority: 'NORMAL',
      programTitle: row.program.title,
      ...profile,
    }).catch(err => console.error('[MatchAction] notifyCaseManagement failed:', err?.message))
  }

  // Send one summary email to admin covering all created cases
  if (createdCases.length > 0) {
    const appUrl = process.env.APP_URL || 'https://logistis.i-mentor.gr'
    const rowListHtml = createdCases.map(c =>
      `<li><a href="${appUrl}/cases/${c.caseId}">#${c.caseNumber} — ${c.businessName}</a></li>`
    ).join('')
    sendEmail({
      to: process.env.ADMIN_EMAIL || 'info@i-mentor.gr',
      subject: `🤝 ${createdCases.length} νέες αναθέσεις από ${row.accountant.officeName || row.accountant.contactPerson} — ${row.program.title}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;">
        <p>Ο λογιστής <strong>${row.accountant.officeName || row.accountant.contactPerson}</strong> ανέθεσε <strong>${createdCases.length} πελάτ${createdCases.length === 1 ? 'η' : 'ες'}</strong> για το πρόγραμμα <strong>«${row.program.title}»</strong> μέσω της σελίδας ανάθεσης.</p>
        <ul>${rowListHtml}</ul>
        <p><a href="${appUrl}/cases">Δείτε όλες τις υποθέσεις →</a></p>
      </div>`,
    }).catch(err => console.error('[MatchAction] admin email failed:', err?.message))
  }

  return NextResponse.json({ created, contactsUpdated })
}
