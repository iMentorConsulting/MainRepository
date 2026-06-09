import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const invitations = await prisma.invitation.findMany({
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(invitations)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { email, note } = await req.json()
  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
  const inv = await prisma.invitation.create({
    data: { email: email.toLowerCase().trim(), note: note || null, expiresAt },
  })

  const base = process.env.APP_URL || 'https://logistis.i-mentor.gr'
  const link = `${base}/register?token=${inv.token}`

  await sendEmail({
    to: email,
    subject: 'Πρόσκληση στο I-MENTOR Portal',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#4f46e5">Καλωσορίσατε στο I-MENTOR Portal!</h2>
        <p>Λάβατε πρόσκληση για να εγγραφείτε στο I-MENTOR Portal — την πλατφόρμα που συνδέει λογιστικά γραφεία με χρηματοδοτικά προγράμματα για τους πελάτες τους.</p>
        ${note ? `<p style="background:#f3f4f6;padding:12px;border-radius:8px;font-style:italic">"${note}"</p>` : ''}
        <p style="margin:24px 0">
          <a href="${link}" style="background:#4f46e5;color:white;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block">
            Δημιουργία Λογαριασμού →
          </a>
        </p>
        <p style="color:#6b7280;font-size:13px">Ο σύνδεσμος ισχύει για 7 ημέρες.</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
        <p style="color:#9ca3af;font-size:12px">I-MENTOR Consulting · <a href="https://www.i-mentor.gr">www.i-mentor.gr</a></p>
      </div>
    `,
  })

  return NextResponse.json(inv, { status: 201 })
}
