import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/crypto'
import { createAuditLog } from '@/lib/audit'

async function loadAssignment(id: string) {
  return prisma.dypaAssignment.findUnique({
    where: { id },
    include: {
      clientCase: {
        include: {
          accountant: { select: { id: true, officeName: true } },
          business: {
            select: {
              id: true, afm: true, onomasia: true, email: true, phone: true,
              postalAddress: true, postalAddressNo: true, postalAreaDescription: true, regdate: true,
              activities: { select: { firmActDescr: true, firmActKind: true }, orderBy: { firmActKind: 'asc' }, take: 1 },
            },
          },
          program: { select: { id: true, title: true, description: true, minSubsidyPct: true, maxSubsidyPct: true } },
        },
      },
    },
  })
}

function serialize(assignment: NonNullable<Awaited<ReturnType<typeof loadAssignment>>>) {
  const { taxisnetUsernameEnc, taxisnetPasswordEnc, ...rest } = assignment
  return { ...rest, taxisnetUsernameSet: !!taxisnetUsernameEnc, taxisnetPasswordSet: !!taxisnetPasswordEnc }
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const assignment = await loadAssignment(params.id)
  if (!assignment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isAdmin = session.user.role === 'ADMIN'
  if (!isAdmin && assignment.clientCase.accountantId !== session.user.accountantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const settings = await prisma.appSetting.findUnique({ where: { id: 'main' } })
  return NextResponse.json({
    ...serialize(assignment),
    pricing: {
      initialFeeCents: settings?.dypaInitialFeeCents ?? 15000,
      recurringFeeCents: settings?.dypaRecurringFeeCents ?? 5000,
      ibanHolderName: settings?.dypaIbanHolderName || 'I-MENTOR ΣΥΜΒΟΥΛΟΙ ΕΠΙΧΕΙΡΗΣΕΩΝ ΙΚΕ',
      ibanPiraeus: settings?.dypaIbanPiraeus || '',
      ibanEurobank: settings?.dypaIbanEurobank || '',
      ibanAlpha: settings?.dypaIbanAlpha || '',
    },
  })
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const assignment = await loadAssignment(params.id)
  if (!assignment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isAdmin = session.user.role === 'ADMIN'
  if (!isAdmin && assignment.clientCase.accountantId !== session.user.accountantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const data: any = {}

  const directFields = [
    'ownerIsLegalEntity', 'ownerLegalEntityName', 'hasExistingStaff',
    'staffIndefiniteFull', 'staffIndefinitePart', 'staffFixedFull', 'staffFixedPart', 'staffOtherForm',
    'hasAffiliatedCompanies', 'affiliatedCompanies', 'positionTitle', 'positionDescription', 'requiresLicense', 'licenseDescription',
    'requiredExperience', 'requiresForeignLanguage', 'foreignLanguages', 'foreignLanguageDescription', 'noRecentLaborFines',
    'genderEqualityPrinciple', 'noRecentStaffReduction',
  ]
  for (const f of directFields) {
    if (body[f] !== undefined) data[f] = body[f]
  }

  if (body.acceptTerms === true && !assignment.termsAcceptedAt) data.termsAcceptedAt = new Date()
  if (body.finalAccept === true && !assignment.finalAcceptedAt) {
    data.finalAcceptedAt = new Date()
    data.status = 'SUBMITTED'
  }

  if (body.hireStartDate !== undefined) {
    data.hireStartDate = body.hireStartDate ? new Date(body.hireStartDate) : null
    data.recurringFeeActive = !!body.hireStartDate
    if (body.hireStartDate) data.status = 'HIRED'
  }

  if (body.taxisnetUsername) data.taxisnetUsernameEnc = encrypt(body.taxisnetUsername)
  if (body.taxisnetPassword) data.taxisnetPasswordEnc = encrypt(body.taxisnetPassword)

  if (isAdmin && body.initialFeeStatus === 'PAID' && assignment.initialFeeStatus !== 'PAID') {
    data.initialFeeStatus = 'PAID'
    data.initialFeePaidAt = new Date()
    data.initialFeeConfirmedBy = session.user.name || session.user.email || 'admin'
    data.status = 'IN_PROGRESS'
  }

  const updated = await prisma.dypaAssignment.update({
    where: { id: params.id },
    data,
    include: {
      clientCase: {
        include: {
          accountant: { select: { id: true, officeName: true } },
          business: {
            select: {
              id: true, afm: true, onomasia: true, email: true, phone: true,
              postalAddress: true, postalAddressNo: true, postalAreaDescription: true, regdate: true,
              activities: { select: { firmActDescr: true, firmActKind: true }, orderBy: { firmActKind: 'asc' }, take: 1 },
            },
          },
          program: { select: { id: true, title: true, description: true, minSubsidyPct: true, maxSubsidyPct: true } },
        },
      },
    },
  })

  await createAuditLog({
    userId: session.user.id,
    action: 'UPDATE',
    entity: 'DypaAssignment',
    entityId: updated.id,
    details: `Ενημέρωση ανάθεσης ΔΥΠΑ #${updated.clientCase.caseNumber}`,
  })

  return NextResponse.json(serialize(updated))
}
