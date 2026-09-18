import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import bcrypt from 'bcryptjs'

// Seed/repair endpoint — ensures the given CONSULTANT users exist with
// EXACTLY the password listed below (I-MENTOR team members who'll be
// reaching out to λογιστές). Auth: admin session OR CRON_SECRET bearer
// token. Safe to call multiple times: if a user already exists (e.g. from
// an earlier partial run, or a stale/wrong password), this RESETS their
// password/role/emailVerified to match this list instead of skipping them —
// otherwise a re-run after fixing a typo here would silently do nothing.
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
    const passwordHash = await bcrypt.hash(c.password, 12)
    const existing = await prisma.user.findUnique({ where: { email: c.email } })
    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { name: c.name, passwordHash, role: 'CONSULTANT', emailVerified: existing.emailVerified ?? new Date() },
      })
      results.push({ email: c.email, created: false, reset: true, id: existing.id, role: 'CONSULTANT' })
      continue
    }
    const user = await prisma.user.create({
      data: {
        name: c.name,
        email: c.email,
        passwordHash,
        role: 'CONSULTANT',
        emailVerified: new Date(),
      },
    })
    results.push({ email: c.email, created: true, reset: false, id: user.id, role: user.role })
  }

  return NextResponse.json({ ok: true, results })
}
