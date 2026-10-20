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

  const nextauthSecret = !!process.env.NEXTAUTH_SECRET
  const authSecret = !!process.env.AUTH_SECRET
  const nodeEnv = process.env.NODE_ENV

  if (!user) {
    return NextResponse.json({
      userFound: false,
      nextauthSecret,
      authSecret,
      nodeEnv,
      fix: 'User missing — call /api/admin/reset-admin?token=iMentor2024Reset first',
    })
  }

  const passwordValid = await bcrypt.compare('Admin@2024!', user.passwordHash)

  return NextResponse.json({
    userFound: true,
    email: user.email,
    role: user.role,
    hashPrefix: user.passwordHash.substring(0, 7),
    passwordValid,
    nextauthSecret,
    authSecret,
    nodeEnv,
    diagnosis: !nextauthSecret && !authSecret
      ? 'PROBLEM: Neither NEXTAUTH_SECRET nor AUTH_SECRET is set in Railway env vars — this breaks JWT sessions'
      : !passwordValid
      ? 'PROBLEM: Password hash does not match Admin@2024!'
      : user.role !== 'ADMIN'
      ? 'PROBLEM: User role is not ADMIN'
      : 'Everything looks OK — try logging in',
  })
}
