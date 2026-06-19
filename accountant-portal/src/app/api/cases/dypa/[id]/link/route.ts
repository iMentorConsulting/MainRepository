import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import { sendViberMessage } from '@/lib/viber'

// Generates a fresh, time-limited public link the accountant can send to the
// business so it can fill in the entire ΔΥΠΑ assignment wizard itself, and
// notifies the business by email/Viber on behalf of I-MENTOR + the accountant.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const assignment = await prisma.dypaAssignment.findUnique({
    where: { id: params.id },
    include: {
      clientCase: {
        select: {
          accountantId: true,
          accountant: { select: { officeName: true } },
          business: { select: { onomasia: true, afm: true, email: true, phone: true } },
        },
      },
    },
  })
  if (!assignment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isAdmin = session.user.role === 'ADMIN'
  if (!isAdmin && assignment.clientCase.accountantId !== session.user.accountantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const contactEmail = (body.contactEmail || assignment.clientCase.business?.email || '').trim()
  const contactPhone = (body.contactPhone || assignment.clientCase.business?.phone || '').trim()

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
  const formToken = await prisma.dypaFormToken.create({
    data: { dypaAssignmentId: assignment.id, expiresAt, contactEmail: contactEmail || null, contactPhone: contactPhone || null },
  })

  const url = `${process.env.APP_URL || 'https://logistis.i-mentor.gr'}/dypa/${formToken.token}`
  const businessName = assignment.clientCase.business?.onomasia || assignment.clientCase.business?.afm || ''
  const officeName = assignment.clientCase.accountant?.officeName || ''

  let emailSent = false
  let viberSent = false

  if (contactEmail) {
    emailSent = await sendEmail({
      to: contactEmail,
      subject: 'Πρόσκληση συμπλήρωσης αίτησης ΔΥΠΑ',
      html: `<p>Αγαπητέ/ή ${businessName || 'συνεργάτη'},</p>
        <p>Η I-MENTOR Consulting, σε συνεργασία με το λογιστικό σας γραφείο${officeName ? ` <strong>${officeName}</strong>` : ''}, σας προσκαλεί να συμπληρώσετε την αίτηση για πρόσληψη ανέργου με επιδότηση ΔΥΠΑ.</p>
        <p><a href="${url}">${url}</a></p>
        <p>Με εκτίμηση,<br/>I-MENTOR Consulting${officeName ? ` &amp; ${officeName}` : ''}</p>`,
    })
  }

  if (contactPhone) {
    const result = await sendViberMessage({
      to: contactPhone,
      text: `Αγαπητέ/ή ${businessName || 'συνεργάτη'}, η I-MENTOR Consulting${officeName ? ` & ${officeName}` : ''} σας προσκαλεί να συμπληρώσετε την αίτηση πρόσληψης ανέργου με επιδότηση ΔΥΠΑ: ${url}`,
      senderName: 'I-MENTOR',
    })
    viberSent = result.ok
  }

  if (emailSent || viberSent) {
    await prisma.dypaFormToken.update({
      where: { id: formToken.id },
      data: { emailSentAt: emailSent ? new Date() : undefined, viberSentAt: viberSent ? new Date() : undefined },
    })
  }

  return NextResponse.json({ url, expiresAt: formToken.expiresAt, emailSent, viberSent })
}
