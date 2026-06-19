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
    dypaInitialFeeCents: setting?.dypaInitialFeeCents ?? 15000,
    dypaRecurringFeeCents: setting?.dypaRecurringFeeCents ?? 5000,
    dypaIbanHolderName: setting?.dypaIbanHolderName || 'I-MENTOR ΣΥΜΒΟΥΛΟΙ ΕΠΙΧΕΙΡΗΣΕΩΝ ΙΚΕ',
    dypaIbanPiraeus: setting?.dypaIbanPiraeus || '',
    dypaIbanEurobank: setting?.dypaIbanEurobank || '',
    dypaIbanAlpha: setting?.dypaIbanAlpha || '',
  })
}

export async function PUT(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const {
    dypaInitialFeeCents, dypaRecurringFeeCents, dypaIbanHolderName,
    dypaIbanPiraeus, dypaIbanEurobank, dypaIbanAlpha,
  } = await request.json()

  const data = {
    dypaInitialFeeCents: dypaInitialFeeCents ?? 15000,
    dypaRecurringFeeCents: dypaRecurringFeeCents ?? 5000,
    dypaIbanHolderName: dypaIbanHolderName || null,
    dypaIbanPiraeus: dypaIbanPiraeus || null,
    dypaIbanEurobank: dypaIbanEurobank || null,
    dypaIbanAlpha: dypaIbanAlpha || null,
  }

  const setting = await prisma.appSetting.upsert({
    where: { id: 'main' },
    update: data,
    create: { id: 'main', ...data },
  })

  return NextResponse.json(setting)
}
