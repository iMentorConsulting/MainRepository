import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  const appUrl = process.env.APP_URL || 'https://logistis.i-mentor.gr'
  if (!token) {
    return NextResponse.redirect(`${appUrl}/login?verify=invalid`)
  }

  const user = await prisma.user.findUnique({ where: { verifyToken: token } })
  if (!user) {
    return NextResponse.redirect(`${appUrl}/login?verify=invalid`)
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: new Date(), verifyToken: null },
  })

  return NextResponse.redirect(`${appUrl}/login?verify=success`)
}
