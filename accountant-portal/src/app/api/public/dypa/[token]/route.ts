import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/crypto'
import { sendEmail } from '@/lib/email'

const EXPERIENCE_LABELS: Record<string, string> = {
  NONE: 'Καμία',
  UP_TO_1: 'Έως 1 έτος',
  UP_TO_2: 'Έως 2 έτη',
  TWO_TO_FIVE: '2-5 έτη',
  OVER_FIVE: 'Άνω των 5 ετών',
}

function yesNo(v: boolean) {
  return v ? 'ΝΑΙ' : 'ΟΧΙ'
}

function formAnswersHtml(a: any) {
  const rows: [string, string][] = [
    ['Ο ιδιοκτήτης είναι νομικό πρόσωπο', yesNo(a.ownerIsLegalEntity)],
    ...(a.ownerIsLegalEntity ? [['Επωνυμία νομικού προσώπου', a.ownerLegalEntityName || '—'] as [string, string]] : []),
    ['Υφιστάμενο προσωπικό', yesNo(a.hasExistingStaff)],
    ...(a.hasExistingStaff ? [
      ['Αορίστου πλήρης απασχόληση', String(a.staffIndefiniteFull ?? 0)],
      ['Αορίστου μερική απασχόληση', String(a.staffIndefinitePart ?? 0)],
      ['Ορισμένου πλήρης απασχόληση', String(a.staffFixedFull ?? 0)],
      ['Ορισμένου μερική απασχόληση', String(a.staffFixedPart ?? 0)],
      ['Άλλη μορφή απασχόλησης', String(a.staffOtherForm ?? 0)],
    ] as [string, string][] : []),
    ['Συνδεδεμένες επιχειρήσεις', yesNo(a.hasAffiliatedCompanies)],
    ...(a.hasAffiliatedCompanies && Array.isArray(a.affiliatedCompanies) ? [
      ['Στοιχεία συνδεδεμένων', a.affiliatedCompanies.map((c: any) => `${c.name} (${c.afm})`).join(', ') || '—'] as [string, string],
    ] : []),
    ['Τίτλος θέσης', a.positionTitle || '—'],
    ['Περιγραφή θέσης', a.positionDescription || '—'],
    ['Απαιτείται άδεια', yesNo(a.requiresLicense)],
    ...(a.requiresLicense ? [['Περιγραφή άδειας', a.licenseDescription || '—'] as [string, string]] : []),
    ['Απαιτούμενη εμπειρία', EXPERIENCE_LABELS[a.requiredExperience] || a.requiredExperience || '—'],
    ['Απαιτείται ξένη γλώσσα', yesNo(a.requiresForeignLanguage)],
    ...(a.requiresForeignLanguage ? [
      ['Γλώσσες', (a.foreignLanguages || []).join(', ') || '—'] as [string, string],
      ['Σχόλια γλώσσας', a.foreignLanguageDescription || '—'] as [string, string],
    ] : []),
    ['Χωρίς πρόσφατα πρόστιμα εργασιακής νομοθεσίας', yesNo(a.noRecentLaborFines)],
    ['Τήρηση αρχής ισότητας φύλων', yesNo(a.genderEqualityPrinciple)],
    ['Χωρίς πρόσφατη μείωση προσωπικού', yesNo(a.noRecentStaffReduction)],
    ['Δήλωση τραπεζικής κατάθεσης προκαταβολής', yesNo(!!a.businessClaimsPaid)],
  ]
  return `<table style="border-collapse:collapse;width:100%;font-size:14px">
    ${rows.map(([label, value]) => `<tr>
      <td style="padding:6px 12px;border:1px solid #e5e7eb;color:#374151;font-weight:bold;white-space:nowrap">${label}</td>
      <td style="padding:6px 12px;border:1px solid #e5e7eb;color:#111827">${value}</td>
    </tr>`).join('')}
  </table>`
}

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

    const business = assignment.clientCase.business
    const program = assignment.clientCase.program
    try {
      await sendEmail({
        to: process.env.ADMIN_EMAIL || 'info@i-mentor.gr',
        subject: `✅ Υποβλήθηκε Φόρμα Ανάθεσης ΔΥΠΑ — ${business.onomasia || business.afm}`,
        html: `<p>Η επιχείρηση <strong>${business.onomasia || business.afm}</strong> (ΑΦΜ: ${business.afm}) υπέβαλε τη φόρμα ανάθεσης για το πρόγραμμα <strong>${program?.title || ''}</strong>.</p>
          ${formAnswersHtml({ ...updated, businessClaimsPaid: markBusinessPaid })}
          <p style="margin-top:16px"><a href="${process.env.APP_URL || 'https://logistis.i-mentor.gr'}/cases/dypa/${assignment.id}">Δείτε την ανάθεση →</a></p>`,
      })
    } catch {}
  }

  const { taxisnetUsernameEnc, taxisnetPasswordEnc, ...rest } = updated
  return NextResponse.json({ ...rest, taxisnetUsernameSet: !!taxisnetUsernameEnc, taxisnetPasswordSet: !!taxisnetPasswordEnc })
}
