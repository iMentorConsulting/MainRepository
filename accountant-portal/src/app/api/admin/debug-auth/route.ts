import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  if (searchParams.get('token') !== 'iMentor2024Reset') {
    return NextResponse.json({ error: 'Invalid token' }, { status: 403 })
  }

  const user = await prisma.user.findUnique({ where: { email: 'info@i-mentor.gr' } })
  if (!user) return NextResponse.json({ error: 'User not found in DB' })

  const testPassword = 'Admin@2024!'
  const valid = await bcrypt.compare(testPassword, user.passwordHash)

  return NextResponse.json({
    found: true,
    email: user.email,
    role: user.role,
    hashPrefix: user.passwordHash.substring(0, 10) + '...',
    passwordValid: valid,
    name: user.name,
  })
}
