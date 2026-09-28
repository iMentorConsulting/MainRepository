import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import crypto from 'crypto'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const schema = z.object({ email: z.string().email() })

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000 // 1h

// In-memory rate limiter: max 3 reset requests per email per hour — mirrors
// the login rate limiter in auth.ts. Prevents someone from spamming a
// user's inbox with reset emails; resets on deploy/restart, which is fine
// for this purpose (a low-stakes annoyance guard, not a security boundary).
const REQUEST_LIMIT = 3
const REQUEST_WINDOW_MS = 60 * 60 * 1000
const requestAttempts = new Map<string, { count: number; resetAt: number }>()

function isRateLimited(key: string): boolean {
  const now = Date.now()
  const entry = requestAttempts.get(key)
  if (!entry || now > entry.resetAt) {
    requestAttempts.set(key, { count: 1, resetAt: now + REQUEST_WINDOW_MS })
    return false
  }
  if (entry.count >= REQUEST_LIMIT) return true
  entry.count += 1
  return false
}

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Μη έγκυρο email' }, { status: 400 })
  }
  const email = parsed.data.email.trim().toLowerCase()

  // Always return the same generic response whether or not the account
  // exists / is rate-limited — avoids leaking which emails have accounts.
  const genericResponse = NextResponse.json({
    message: 'Αν υπάρχει λογαριασμός με αυτό το email, θα λάβετε σύνδεσμο επαναφοράς κωδικού σε λίγα λεπτά.',
  })

  if (isRateLimited(email)) return genericResponse

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) return genericResponse

  const resetToken = crypto.randomBytes(32).toString('hex')
  await prisma.user.update({
    where: { id: user.id },
    data: { resetToken, resetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
  })

  const appUrl = process.env.APP_URL || 'https://logistis.i-mentor.gr'
  const resetUrl = `${appUrl}/reset-password?token=${resetToken}`

  await sendEmail({
    to: user.email,
    subject: 'I-MENTOR Portal — Επαναφορά κωδικού πρόσβασης',
    html: `<p>Γεια σας ${user.name},</p>
      <p>Λάβαμε αίτημα επαναφοράς κωδικού πρόσβασης για τον λογαριασμό σας στο I-MENTOR Portal.</p>
      <p><a href="${resetUrl}">Πατήστε εδώ για να ορίσετε νέο κωδικό πρόσβασης</a></p>
      <p>Ο σύνδεσμος ισχύει για 1 ώρα. Αν δεν κάνατε εσείς αυτό το αίτημα, αγνοήστε αυτό το email — ο κωδικός σας παραμένει αμετάβλητος.</p>
      <p>Με εκτίμηση,<br>Η ομάδα της I-MENTOR</p>`,
  })

  return genericResponse
}
