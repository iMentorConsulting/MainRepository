import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET/PUT the email kill-switch for the Finance payment commission-approval flow.
export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const settings = await prisma.appSetting.findUnique({ where: { id: 'main' } })
  return NextResponse.json({ financeCommissionEmailsEnabled: settings?.financeCommissionEmailsEnabled === true })
}

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { enabled } = await req.json()
  const settings = await prisma.appSetting.upsert({
    where: { id: 'main' },
    update: { financeCommissionEmailsEnabled: !!enabled },
    create: { id: 'main', financeCommissionEmailsEnabled: !!enabled },
  })
  return NextResponse.json({ financeCommissionEmailsEnabled: settings.financeCommissionEmailsEnabled })
}
