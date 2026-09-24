import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sendEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { reason } = await request.json().catch(() => ({ reason: '' }))

  const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER || 'info@i-mentor.gr'

  await sendEmail({
    to: adminEmail,
    subject: `[GDPR] Αίτημα Διαγραφής Δεδομένων — ${session.user.email}`,
    html: `
      <h2>Αίτημα Διαγραφής Δεδομένων</h2>
      <p><strong>Χρήστης:</strong> ${session.user.name} (${session.user.email})</p>
      <p><strong>Ρόλος:</strong> ${session.user.role}</p>
      <p><strong>Αιτία/Σχόλιο:</strong> ${reason || '—'}</p>
      <p><strong>Ημερομηνία:</strong> ${new Date().toLocaleString('el-GR')}</p>
      <hr/>
      <p>Απαιτείται διαγραφή λογαριασμού και όλων των συσχετισμένων δεδομένων εντός 30 ημερών (ΓΚΠΔ Άρθρο 17).</p>
    `,
  })

  return NextResponse.json({ ok: true })
}
