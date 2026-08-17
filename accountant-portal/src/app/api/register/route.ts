import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import { sendViberMessage } from '@/lib/viber'
import { lookupAfm } from '@/lib/gsis'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { z } from 'zod'

const ADMIN_VIBER_NUMBER = '6973315365'

const schema = z.object({
  officeName: z.string().min(2),
  contactPerson: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  password: z.string().min(8),
  afm: z.string().regex(/^\d{9}$/, 'Το ΑΦΜ πρέπει να αποτελείται από 9 ψηφία'),
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

  // Look up the office's own ΑΦΜ in ΑΑΔΕ/ΓΓΠΣ so the admin can verify it's a
  // real accounting office before approving, and so we can auto-create the
  // office as the accountant's first business once approved.
  const gsisData = await lookupAfm(data.afm)

  const passwordHash = await bcrypt.hash(data.password, 12)
  const verifyToken = crypto.randomBytes(32).toString('hex')
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
        afm: data.afm,
        pendingBusinessData: gsisData ? (gsisData as any) : undefined,
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
        verifyToken,
      },
    })
    return { accountant, user }
  })

  const verifyUrl = `${process.env.APP_URL || 'https://logistis.i-mentor.gr'}/api/verify-email?token=${verifyToken}`
  await sendEmail({
    to: data.email,
    subject: 'I-MENTOR Portal — Επιβεβαιώστε το email σας',
    html: `<p>Αγαπητέ/ή ${data.contactPerson},</p>
      <p>Ο λογαριασμός του γραφείου <strong>${data.officeName}</strong> δημιουργήθηκε. Για να ενεργοποιήσετε τον λογαριασμό σας, επιβεβαιώστε το email σας πατώντας τον παρακάτω σύνδεσμο:</p>
      <p><a href="${verifyUrl}">Επιβεβαίωση email</a></p>
      <p>Μετά την επιβεβαίωση θα μπορείτε να συνδεθείτε στο <a href="${process.env.APP_URL || 'https://logistis.i-mentor.gr'}/login">I-MENTOR Portal</a> με το email και τον κωδικό πρόσβασης που επιλέξατε.</p>
      <p>Η αναζήτηση επιχειρήσεων μέσω ΑΑΔΕ θα ενεργοποιηθεί μόλις η ομάδα μας εγκρίνει την αίτησή σας — θα ενημερωθείτε με νέο email.</p>
      <p>Με εκτίμηση,<br>Η ομάδα της I-MENTOR</p>`,
  })

  // Build a detailed ΑΑΔΕ section for the admin email so they can verify
  // it's a real accounting office before approving.
  let gsisHtml = '<p style="color:#dc2626"><strong>Δεν ήταν δυνατή η ανάκτηση στοιχείων από ΑΑΔΕ/ΓΓΠΣ για το ΑΦΜ ' + data.afm + '.</strong></p>'
  if (gsisData) {
    const activitiesHtml = gsisData.activities.length
      ? `<ul style="margin:4px 0 0;padding-left:18px">${gsisData.activities.map(a =>
          `<li>${a.firmActCode} — ${a.firmActDescr || ''} (${a.firmActKindDescr || ''})</li>`
        ).join('')}</ul>`
      : '<p style="margin:4px 0 0;color:#9ca3af">(καμία)</p>'

    gsisHtml = `
      <h3 style="margin:16px 0 6px;color:#111827">Στοιχεία ΑΑΔΕ/ΓΓΠΣ για ΑΦΜ ${data.afm}</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:3px 8px 3px 0;color:#6b7280">Επωνυμία:</td><td><strong>${gsisData.onomasia}</strong></td></tr>
        <tr><td style="padding:3px 8px 3px 0;color:#6b7280">Διακριτικός τίτλος:</td><td>${gsisData.commercialTitle || ''}</td></tr>
        <tr><td style="padding:3px 8px 3px 0;color:#6b7280">Νομική μορφή:</td><td>${gsisData.legalStatusDescr || ''}</td></tr>
        <tr><td style="padding:3px 8px 3px 0;color:#6b7280">Ημ/νία έναρξης:</td><td>${gsisData.regdate || ''}</td></tr>
        <tr><td style="padding:3px 8px 3px 0;color:#6b7280">Ημ/νία διακοπής:</td><td>${gsisData.stopDate || '—'}</td></tr>
        <tr><td style="padding:3px 8px 3px 0;color:#6b7280">Κατάσταση:</td><td>${gsisData.deactivationFlagDescr || gsisData.firmFlagDescr || ''}</td></tr>
        <tr><td style="padding:3px 8px 3px 0;color:#6b7280">Διεύθυνση:</td><td>${gsisData.postalAddress || ''} ${gsisData.postalAddressNo || ''}, ${gsisData.postalZipCode || ''} ${gsisData.postalAreaDescription || ''}</td></tr>
        <tr><td style="padding:3px 8px 3px 0;color:#6b7280">ΔΟΥ:</td><td>${gsisData.doyDescr || ''}</td></tr>
        <tr><td style="padding:3px 8px 3px 0;vertical-align:top;color:#6b7280">Δραστηριότητες ΚΑΔ:</td><td>${activitiesHtml}</td></tr>
      </table>`
  }

  const adminEmail = process.env.SMTP_USER || process.env.GMAIL_USER || process.env.ADMIN_EMAIL || ''
  if (adminEmail) {
    await sendEmail({
      to: adminEmail,
      subject: `Νέα εγγραφή λογιστικού γραφείου σε αναμονή έγκρισης: ${data.officeName}`,
      html: `<p>Νέο γραφείο εγγράφηκε και αναμένει έγκριση: <strong>${data.officeName}</strong> (${data.contactPerson}, ${data.email}${data.phone ? `, τηλ. ${data.phone}` : ''}).</p>
        <p>ΑΦΜ γραφείου: <strong>${data.afm}</strong></p>
        <p>Τοποθεσία: ${data.officeLocation}<br>Αριθμός πελατών: ${data.clientCountRange}<br>Στόχος συνεργασίας: ${goalLabel}</p>
        ${data.notes ? `<p>Σημειώσεις αιτούντος: ${data.notes}</p>` : ''}
        ${gsisHtml}
        <p style="margin-top:16px">Ο λογιστής <strong>δεν</strong> μπορεί να συνδεθεί μέχρι να εγκριθεί. Μεταβείτε στο <a href="${process.env.APP_URL || 'https://logistis.i-mentor.gr'}/accountants?pending=1">/accountants</a> για έγκριση.</p>`,
    })
  }

  // Notify admin via Viber as well
  try {
    const viberLines = [
      `Νέα εγγραφή λογιστικού γραφείου σε αναμονή έγκρισης:`,
      `${data.officeName} (ΑΦΜ ${data.afm})`,
      `${data.contactPerson} — ${data.email}${data.phone ? ` — ${data.phone}` : ''}`,
      gsisData ? `ΑΑΔΕ: ${gsisData.onomasia} (${gsisData.legalStatusDescr || ''})` : 'ΑΑΔΕ: δεν βρέθηκαν στοιχεία',
      `Έγκριση: ${process.env.APP_URL || 'https://logistis.i-mentor.gr'}/accountants?pending=1`,
    ]
    await sendViberMessage({ to: ADMIN_VIBER_NUMBER, text: viberLines.join('\n'), senderName: 'I-MENTOR Portal' })
  } catch (err: any) {
    console.error('[Register] Admin Viber notification failed:', err?.message || err)
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
