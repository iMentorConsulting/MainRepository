import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

const SET_PASSWORD_TTL_MS = 72 * 60 * 60 * 1000 // 72h

const schema = z.object({
  name: z.string().trim().min(2, 'Συμπληρώστε ονοματεπώνυμο'),
  email: z.string().trim().toLowerCase().email('Μη έγκυρο email'),
})

// Creates a CONSULTANT (σύμβουλος) login. No password is ever typed or stored in
// code: the account gets a random unusable password and the consultant receives
// a link (the standard reset-password page) to choose their own. The link is
// also returned so the admin can pass it on if the email doesn't arrive.
// Name convention across the app: "Επώνυμο Όνομα" (e.g. "Βαρδιάμπασης Μάνος").
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Μη έγκυρα στοιχεία' }, { status: 400 })
  }
  const { name, email } = parsed.data

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json({ error: `Υπάρχει ήδη χρήστης με το email ${email} (ρόλος ${existing.role}).` }, { status: 409 })
  }

  const resetToken = crypto.randomBytes(32).toString('hex')
  const user = await prisma.user.create({
    data: {
      name,
      email,
      role: 'CONSULTANT',
      passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12),
      emailVerified: new Date(),
      resetToken,
      resetTokenExpiresAt: new Date(Date.now() + SET_PASSWORD_TTL_MS),
    },
  })

  const appUrl = process.env.APP_URL || 'https://logistis.i-mentor.gr'
  const setPasswordUrl = `${appUrl}/reset-password?token=${resetToken}`
  const emailSent = await sendEmail({
    to: email,
    subject: 'I-MENTOR Portal — Ο λογαριασμός σας είναι έτοιμος',
    html: `<p>Γεια σας ${name},</p>
      <p>Δημιουργήθηκε λογαριασμός συμβούλου για εσάς στο I-MENTOR Portal (${appUrl}).</p>
      <p><a href="${setPasswordUrl}">Πατήστε εδώ για να ορίσετε τον κωδικό πρόσβασής σας</a></p>
      <p>Ο σύνδεσμος ισχύει για 72 ώρες. Αν λήξει, χρησιμοποιήστε το «Ξέχασα τον κωδικό μου» στη σελίδα σύνδεσης.</p>
      <p>Με εκτίμηση,<br>Η ομάδα της I-MENTOR</p>`,
  }).catch(() => false)

  return NextResponse.json({ id: user.id, name, email, role: user.role, emailSent, setPasswordUrl }, { status: 201 })
}
