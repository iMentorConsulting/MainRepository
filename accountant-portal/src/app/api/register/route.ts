import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

const schema = z.object({
  officeName: z.string().min(2),
  contactPerson: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  password: z.string().min(8),
  officeLocation: z.string().min(2),
  clientCountRange: z.string().min(1),
  cooperationGoal: z.string().min(1),
  notes: z.string().optional(),
  invitationToken: z.string().optional(),
})

const COOPERATION_GOAL_LABELS: Record<string, string> = {
  opportunities: 'Στοχευμένες ευκαιρίες επιδότησης για τους πελάτες',
  commissions: 'Προμήθειες από επιτυχημένες υποθέσεις',
  both: 'Ευκαιρίες επιδότησης & προμήθειες',
  other: 'Άλλο',
}

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Μη έγκυρα στοιχεία φόρμας' }, { status: 400 })
  }
  const data = parsed.data

  // Validate invitation token if provided
  if (data.invitationToken) {
    const inv = await prisma.invitation.findUnique({ where: { token: data.invitationToken } })
    if (!inv || inv.status !== 'PENDING' || inv.expiresAt < new Date()) {
      return NextResponse.json({ error: 'Ο σύνδεσμος πρόσκλησης δεν ισχύει ή έχει λήξει.' }, { status: 400 })
    }
  }

  const existingUser = await prisma.user.findUnique({ where: { email: data.email } })
  if (existingUser) {
    return NextResponse.json({ error: 'Υπάρχει ήδη λογαριασμός με αυτό το email' }, { status: 409 })
  }

  const passwordHash = await bcrypt.hash(data.password, 12)
  const goalLabel = COOPERATION_GOAL_LABELS[data.cooperationGoal] || data.cooperationGoal

  // The questionnaire answers are kept on the office's notes for the admin
  // to review when deciding whether to approve AADE/GSIS access.
  const notes = [
    `Τοποθεσία γραφείου: ${data.officeLocation}`,
    `Αριθμός πελατών (κατά την εγγραφή): ${data.clientCountRange}`,
    `Στόχος συνεργασίας: ${goalLabel}`,
    data.notes ? `Σημειώσεις αιτούντος: ${data.notes}` : null,
  ].filter(Boolean).join('\n')

  const { accountant } = await prisma.$transaction(async tx => {
    const accountant = await tx.accountant.create({
      data: {
        officeName: data.officeName,
        contactPerson: data.contactPerson,
        email: data.email,
        phone: data.phone || null,
        notes,
        approved: false,
      },
    })
    const user = await tx.user.create({
      data: {
        name: data.contactPerson,
        email: data.email,
        passwordHash,
        role: 'ACCOUNTANT',
        accountantId: accountant.id,
      },
    })
    return { accountant, user }
  })

  await sendEmail({
    to: data.email,
    subject: 'Καλώς ήρθατε στο I-MENTOR Portal — ο λογαριασμός σας είναι έτοιμος',
    html: `<p>Αγαπητέ/ή ${data.contactPerson},</p>
      <p>Ο λογαριασμός του γραφείου <strong>${data.officeName}</strong> δημιουργήθηκε. Μπορείτε να συνδεθείτε άμεσα στο
      <a href="${process.env.APP_URL || 'https://logistis.i-mentor.gr'}/login">I-MENTOR Portal</a> με το email και τον κωδικό πρόσβασης που επιλέξατε.</p>
      <p>Η αναζήτηση επιχειρήσεων μέσω ΑΑΔΕ θα ενεργοποιηθεί μόλις η ομάδα μας εγκρίνει την αίτησή σας — θα ενημερωθείτε με νέο email.</p>
      <p>Με εκτίμηση,<br>Η ομάδα της I-MENTOR</p>`,
  })

  const adminEmail = process.env.SMTP_USER || process.env.GMAIL_USER || ''
  if (adminEmail) {
    await sendEmail({
      to: adminEmail,
      subject: `Νέα εγγραφή λογιστικού γραφείου σε αναμονή έγκρισης: ${data.officeName}`,
      html: `<p>Νέο γραφείο εγγράφηκε και αναμένει έγκριση πρόσβασης ΑΑΔΕ: <strong>${data.officeName}</strong> (${data.contactPerson}, ${data.email}).</p>
        <p>Τοποθεσία: ${data.officeLocation}<br>Αριθμός πελατών: ${data.clientCountRange}<br>Στόχος συνεργασίας: ${goalLabel}</p>
        <p>Μεταβείτε στο <a href="${process.env.APP_URL || 'https://logistis.i-mentor.gr'}/accountants?pending=1">/accountants</a> για έγκριση.</p>`,
    })
  }

  // Mark invitation as accepted
  if (data.invitationToken) {
    await prisma.invitation.updateMany({
      where: { token: data.invitationToken },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
    })
  }

  return NextResponse.json({ id: accountant.id }, { status: 201 })
}
