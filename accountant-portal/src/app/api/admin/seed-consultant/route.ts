import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import bcrypt from 'bcryptjs'

// One-shot endpoint — creates the Consultant user if it doesn't exist yet.
// Auth: admin session OR CRON_SECRET bearer token.
// Safe to call multiple times — idempotent (checks before creating).
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const isCron = process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`
  if (!isCron) {
    const session = await auth()
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const EMAIL = 'nikoskartz@gmail.com'
  const existing = await prisma.user.findUnique({ where: { email: EMAIL } })
  if (existing) {
    return NextResponse.json({ ok: true, created: false, id: existing.id, role: existing.role })
  }

  const passwordHash = await bcrypt.hash('Karatz1', 12)
  const user = await prisma.user.create({
    data: {
      name: 'Nikos Karatzas',
      email: EMAIL,
      passwordHash,
      role: 'CONSULTANT',
      emailVerified: new Date(),
    },
  })

  return NextResponse.json({ ok: true, created: true, id: user.id, role: user.role }, { status: 201 })
}
