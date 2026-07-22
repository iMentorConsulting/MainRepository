import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { sendEmail } from '@/lib/email'
import { runMatchingForBusiness } from '@/lib/matching'
import type { GsisBusinessData } from '@/lib/gsis'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isOwnAccountant = session.user.role === 'ACCOUNTANT' && session.user.accountantId === params.id
  if (session.user.role !== 'ADMIN' && !isOwnAccountant) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const accountant = await prisma.accountant.findUnique({
    where: { id: params.id },
    include: {
      users: { select: { id: true, name: true, email: true, role: true } },
      businesses: {
        select: {
          id: true, afm: true, onomasia: true, postalAreaDescription: true, postalZipCode: true,
          commercialTitle: true, legalStatusDescr: true, firmFlagDescr: true, deactivationFlagDescr: true,
          regdate: true, stopDate: true, postalAddress: true, postalAddressNo: true, doyDescr: true,
          activities: { select: { firmActCode: true, firmActDescr: true, firmActKindDescr: true } },
        }
      },
    }
  })

  if (!accountant) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(accountant)
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isOwnAccountant = session.user.role === 'ACCOUNTANT' && session.user.accountantId === params.id
  if (session.user.role !== 'ADMIN' && !isOwnAccountant) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  // Accountants can self-manage their own profile fields; only admins can
  // touch approval/active/notes and other sensitive flags.
  const data = isOwnAccountant
    ? {
        officeName: body.officeName,
        contactPerson: body.contactPerson,
        phone: body.phone,
        address: body.address,
        logoUrl: body.logoUrl,
      }
    : body
  delete data.id
  delete data.createdAt
  delete data.updatedAt
  delete data.users
  delete data.businesses

  const existing = await prisma.accountant.findUnique({ where: { id: params.id }, select: { approved: true, email: true, contactPerson: true, officeName: true, afm: true, pendingBusinessData: true } })

  const accountant = await prisma.accountant.update({
    where: { id: params.id },
    data,
  })

  if (existing && !existing.approved && data.approved === true) {
    await sendEmail({
      to: existing.email,
      subject: 'Ο λογαριασμός σας στο I-MENTOR Portal εγκρίθηκε',
      html: `<p>Αγαπητέ/ή ${existing.contactPerson},</p>
        <p>Ο λογαριασμός του γραφείου <strong>${existing.officeName}</strong> εγκρίθηκε από την ομάδα της I-MENTOR. Μπορείτε πλέον να συνδεθείτε στο
        <a href="${process.env.APP_URL || 'https://logistis.i-mentor.gr'}/login">I-MENTOR Portal</a>.</p>
        <p>Με εκτίμηση,<br>Η ομάδα της I-MENTOR</p>`,
    })

    // Auto-create the office's own business record (its first "client") from
    // the GSIS data captured at registration time.
    if (existing.pendingBusinessData && existing.afm) {
      const gsisData = existing.pendingBusinessData as unknown as GsisBusinessData
      const alreadyExists = await prisma.business.findUnique({ where: { afm: existing.afm } })
      if (!alreadyExists) {
        const business = await prisma.business.create({
          data: {
            accountantId: params.id,
            afm: existing.afm,
            onomasia: gsisData.onomasia,
            commercialTitle: gsisData.commercialTitle,
            legalStatusDescr: gsisData.legalStatusDescr,
            firmFlagDescr: gsisData.firmFlagDescr,
            iNiFlagDescr: gsisData.iNiFlagDescr,
            deactivationFlag: gsisData.deactivationFlag,
            deactivationFlagDescr: gsisData.deactivationFlagDescr,
            regdate: gsisData.regdate,
            stopDate: gsisData.stopDate,
            postalAddress: gsisData.postalAddress,
            postalAddressNo: gsisData.postalAddressNo,
            postalZipCode: gsisData.postalZipCode,
            postalAreaDescription: gsisData.postalAreaDescription,
            doy: gsisData.doy,
            doyDescr: gsisData.doyDescr,
            email: existing.email,
          },
        })
        if (gsisData.activities?.length) {
          await prisma.businessActivity.createMany({
            data: gsisData.activities.map(a => ({
              businessId: business.id,
              firmActCode: a.firmActCode,
              firmActDescr: a.firmActDescr,
              firmActKind: a.firmActKind,
              firmActKindDescr: a.firmActKindDescr,
            })),
          })
        }
        // Match the office's own ΑΦΜ against active programs right away — the
        // office IS a business and its owners expect to see their own matches.
        runMatchingForBusiness(business.id).catch(err =>
          console.error('[AccountantApprove] matching failed:', err instanceof Error ? err.message : err))
      } else {
        // Business already existed (e.g. imported earlier) — ensure it has matches
        runMatchingForBusiness(alreadyExists.id).catch(err =>
          console.error('[AccountantApprove] matching failed:', err instanceof Error ? err.message : err))
      }
    }
    await prisma.accountant.update({ where: { id: params.id }, data: { pendingBusinessData: Prisma.JsonNull } })
  }

  return NextResponse.json(accountant)
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Delete all dependent records before removing the accountant
  // (no onDelete: Cascade on most of these relations)
  const businesses = await prisma.business.findMany({
    where: { accountantId: params.id },
    select: { id: true },
  })
  const businessIds = businesses.map(b => b.id)

  await prisma.$transaction([
    // Business-level dependents
    prisma.campaignRecipient.deleteMany({ where: { businessId: { in: businessIds } } }),
    prisma.programMatch.deleteMany({ where: { businessId: { in: businessIds } } }),
    prisma.imentorRequest.deleteMany({ where: { businessId: { in: businessIds } } }),
    prisma.commission.deleteMany({ where: { businessId: { in: businessIds } } }),
    prisma.paymentRequest.deleteMany({ where: { businessId: { in: businessIds } } }),
    // Accountant-level dependents
    prisma.notification.deleteMany({ where: { accountantId: params.id } }),
    prisma.campaign.deleteMany({ where: { accountantId: params.id } }),
    prisma.chatConversation.deleteMany({ where: { accountantId: params.id } }), // messages cascade
    prisma.accountantCommissionOverride.deleteMany({ where: { accountantId: params.id } }),
    prisma.business.deleteMany({ where: { accountantId: params.id } }),
    prisma.user.deleteMany({ where: { accountantId: params.id } }),
    prisma.accountant.delete({ where: { id: params.id } }),
  ])

  return NextResponse.json({ success: true })
}
