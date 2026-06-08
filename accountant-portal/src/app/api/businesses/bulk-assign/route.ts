import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { ids, accountantId } = await request.json()
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'Δεν επιλέχθηκαν επιχειρήσεις' }, { status: 400 })
  }

  if (accountantId) {
    const accountant = await prisma.accountant.findUnique({ where: { id: accountantId } })
    if (!accountant) return NextResponse.json({ error: 'Ο λογιστής δεν βρέθηκε' }, { status: 404 })
  }

  const result = await prisma.business.updateMany({
    where: { id: { in: ids } },
    data: { accountantId: accountantId || null },
  })

  await createAuditLog({
    userId: session.user.id,
    action: 'BULK_ASSIGN',
    entity: 'Business',
    entityId: ids.join(','),
    details: `Bulk assigned ${result.count} businesses to accountant ${accountantId || '(none)'}`,
  })

  return NextResponse.json({ updated: result.count })
}
