import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const setting = await prisma.appSetting.findUnique({ where: { id: 'main' } })
  return NextResponse.json({ imentorLogoUrl: setting?.imentorLogoUrl || null })
}

export async function PUT(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { imentorLogoUrl } = await request.json()
  const setting = await prisma.appSetting.upsert({
    where: { id: 'main' },
    update: { imentorLogoUrl: imentorLogoUrl || null },
    create: { id: 'main', imentorLogoUrl: imentorLogoUrl || null },
  })
  return NextResponse.json({ imentorLogoUrl: setting.imentorLogoUrl })
}
