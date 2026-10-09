import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  if (searchParams.get('token') !== 'iMentor2024Reset') {
    return NextResponse.json({ error: 'Invalid token' }, { status: 403 })
  }
  const hash = await bcrypt.hash('Admin@2024!', 12)
  const user = await prisma.user.upsert({
    where: { email: 'info@i-mentor.gr' },
    update: { passwordHash: hash, role: 'ADMIN' },
    create: { name: 'I-MENTOR Admin', email: 'info@i-mentor.gr', passwordHash: hash, role: 'ADMIN' },
  })
  return NextResponse.json({ ok: true, email: user.email, message: 'Password reset to Admin@2024!' })
}
