import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export const dynamic = 'force-dynamic'

// One-time admin credential reset endpoint.
// Call: GET /api/admin/reset-admin?token=iMentor2024Reset
// Remove this file after first successful login.
const RESET_TOKEN = process.env.ADMIN_RESET_TOKEN || 'iMentor2024Reset'
const ADMIN_EMAIL = 'info@i-mentor.gr'
const ADMIN_PASSWORD = 'Admin@2024!'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  if (searchParams.get('token') !== RESET_TOKEN) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 403 })
  }

  const hash = await bcrypt.hash(ADMIN_PASSWORD, 12)

  const user = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { passwordHash: hash, role: 'ADMIN' },
    create: {
      name: 'I-MENTOR Admin',
      email: ADMIN_EMAIL,
      passwordHash: hash,
      role: 'ADMIN',
    },
  })

  return NextResponse.json({
    ok: true,
    message: `Admin user ${user.email} password has been reset to "${ADMIN_PASSWORD}". You can now login.`,
  })
}
