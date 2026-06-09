import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'

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
        select: { id: true, afm: true, onomasia: true, postalAreaDescription: true, postalZipCode: true }
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

  const existing = await prisma.accountant.findUnique({ where: { id: params.id }, select: { approved: true, email: true, contactPerson: true, officeName: true } })

  const accountant = await prisma.accountant.update({
    where: { id: params.id },
    data,
  })

  if (existing && !existing.approved && data.approved === true) {
    await sendEmail({
      to: existing.email,
      subject: 'Η πρόσβαση ΑΑΔΕ στο I-MENTOR Portal εγκρίθηκε',
      html: `<p>Αγαπητέ/ή ${existing.contactPerson},</p>
        <p>Ο λογαριασμός του γραφείου <strong>${existing.officeName}</strong> εγκρίθηκε από την ομάδα της I-MENTOR. Μπορείτε πλέον να αναζητάτε και να εισάγετε επιχειρήσεις μέσω ΑΑΔΕ/ΓΓΠΣ στο
        <a href="${process.env.APP_URL || 'https://logistis.i-mentor.gr'}/login">I-MENTOR Portal</a>.</p>
        <p>Με εκτίμηση,<br>Η ομάδα της I-MENTOR</p>`,
    })
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
