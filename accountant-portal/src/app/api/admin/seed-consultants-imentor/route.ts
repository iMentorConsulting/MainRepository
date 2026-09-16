import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import bcrypt from 'bcryptjs'

// One-shot endpoint — creates the given CONSULTANT users if they don't exist
// yet (I-MENTOR team members who'll be reaching out to λογιστές). Same
// pattern as /api/admin/seed-consultant. Auth: admin session OR CRON_SECRET
// bearer token. Safe to call multiple times — idempotent per email.
const CONSULTANTS = [
  { name: 'Βαρδιάμπασης Μάνος', email: 'manos@i-mentor.gr', password: 'CEFIUu7xipI5' },
  { name: 'Χριστοφάκη Στέλλα', email: 'stella@i-mentor.gr', password: 'aAQI604xyY8' },
  { name: 'Μποτσάκη Βάλλια', email: 'vallia@i-mentor.gr', password: '0tkxXHXaeioA' },
  { name: 'Δαμά Σοφία', email: 'sofia@i-mentor.gr', password: 'HPKsUe7m1HkR' },
]

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const isCron = process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`
  if (!isCron) {
    const session = await auth()
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const results = []
  for (const c of CONSULTANTS) {
    const existing = await prisma.user.findUnique({ where: { email: c.email } })
    if (existing) {
      results.push({ email: c.email, created: false, id: existing.id, role: existing.role })
      continue
    }
    const passwordHash = await bcrypt.hash(c.password, 12)
    const user = await prisma.user.create({
      data: {
        name: c.name,
        email: c.email,
        passwordHash,
        role: 'CONSULTANT',
        emailVerified: new Date(),
      },
    })
    results.push({ email: c.email, created: true, id: user.id, role: user.role })
  }

  return NextResponse.json({ ok: true, results })
}
