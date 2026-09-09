import { NextRequest, NextResponse } from 'next/server'
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
    aadeUser: setting?.aadeUser || '',
    aadeCallerAfm: setting?.aadeCallerAfm || '',
    aadePassSet: !!(setting?.aadePass),
  })
}

export async function PUT(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { aadeUser, aadePass, aadeCallerAfm } = await request.json()

  const updateData: any = {
    aadeUser: aadeUser || null,
    aadeCallerAfm: aadeCallerAfm || null,
  }
  if (aadePass) updateData.aadePass = aadePass

  const setting = await prisma.appSetting.upsert({
    where: { id: 'main' },
    update: updateData,
    create: { id: 'main', ...updateData },
  })

  return NextResponse.json({
    aadeUser: setting.aadeUser || '',
    aadeCallerAfm: setting.aadeCallerAfm || '',
    aadePassSet: !!(setting.aadePass),
  })
}
