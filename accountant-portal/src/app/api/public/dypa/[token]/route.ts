import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/crypto'

export const dynamic = 'force-dynamic'

async function loadByToken(token: string) {
  const formToken = await prisma.dypaFormToken.findUnique({ where: { token } })
  if (!formToken) return { error: 'Ο σύνδεσμος δεν είναι έγκυρος.' as const }
  if (formToken.expiresAt < new Date()) return { error: 'Ο σύνδεσμος έχει λήξει. Επικοινωνήστε με τον λογιστή σας.' as const }

  const assignment = await prisma.dypaAssignment.findUnique({
    where: { id: formToken.dypaAssignmentId },
    include: {
      clientCase: {
        include: {
          business: {
            select: {
              onomasia: true, afm: true,
              postalAddress: true, postalAddressNo: true, postalAreaDescription: true, regdate: true,
              activities: { select: { firmActDescr: true, firmActKind: true }, orderBy: { firmActKind: 'asc' }, take: 1 },
            },
          },
          program: { select: { title: true, description: true, minSubsidyPct: true, maxSubsidyPct: true } },
        },
      },
    },
  })
  if (!assignment) return { error: 'Δεν βρέθηκε η ανάθεση.' as const }
  return { formToken, assignment }
}

function serialize(assignment: any) {
  const { taxisnetUsernameEnc, taxisnetPasswordEnc, ...rest } = assignment
  return { ...rest, taxisnetUsernameSet: !!taxisnetUsernameEnc, taxisnetPasswordSet: !!taxisnetPasswordEnc }
}

export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  const result = await loadByToken(params.token)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 })

  const settings = await prisma.appSetting.findUnique({ where: { id: 'main' } })

  return NextResponse.json({
    assignment: serialize(result.assignment),
    business: result.assignment.clientCase.business,
    program: result.assignment.clientCase.program,
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

export async function PUT(request: NextRequest, { params }: { params: { token: string } }) {
  const result = await loadByToken(params.token)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 })
  const { assignment, formToken } = result

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

  let markBusinessPaid = false
  if (body.finalAccept === true && !assignment.finalAcceptedAt) {
    data.finalAcceptedAt = new Date()
    data.status = 'SUBMITTED'
    markBusinessPaid = !!body.businessClaimsPaid
  }

  if (body.taxisnetUsername) data.taxisnetUsernameEnc = encrypt(body.taxisnetUsername)
  if (body.taxisnetPassword) data.taxisnetPasswordEnc = encrypt(body.taxisnetPassword)

  const updated = await prisma.dypaAssignment.update({
    where: { id: assignment.id },
    data: {
      ...data,
      clientCase: markBusinessPaid ? {
        update: {
          activities: {
            create: {
              type: 'COMMENT',
              body: 'Η επιχείρηση δήλωσε μέσω του δημόσιου συνδέσμου ότι πραγματοποίησε την τραπεζική κατάθεση της προκαταβολής. Χρειάζεται χειροκίνητη επιβεβαίωση από τον διαχειριστή.',
              authorId: 'public-form',
              authorName: assignment.clientCase.business.onomasia || assignment.clientCase.business.afm,
              authorRole: 'BUSINESS',
            },
          },
        },
      } : undefined,
    },
  })

  if (data.finalAcceptedAt) {
    await prisma.dypaFormToken.update({ where: { id: formToken.id }, data: { usedAt: new Date() } })
  }

  const { taxisnetUsernameEnc, taxisnetPasswordEnc, ...rest } = updated
  return NextResponse.json({ ...rest, taxisnetUsernameSet: !!taxisnetUsernameEnc, taxisnetPasswordSet: !!taxisnetPasswordEnc })
}
