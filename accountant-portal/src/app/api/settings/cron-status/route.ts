import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const setting = await prisma.appSetting.findUnique({ where: { id: 'main' } })
  return NextResponse.json({
    espaCronLastRunAt: setting?.espaCronLastRunAt || null,
    espaCronLastError: setting?.espaCronLastError || null,
    dypaCronLastRunAt: setting?.dypaCronLastRunAt || null,
    dypaCronLastError: setting?.dypaCronLastError || null,
  })
}
