import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { ids } = await request.json()
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'Δεν επιλέχθηκαν επιχειρήσεις' }, { status: 400 })
  }

  const result = await prisma.business.deleteMany({ where: { id: { in: ids } } })

  await createAuditLog({
    userId: session.user.id,
    action: 'BULK_DELETE',
    entity: 'Business',
    entityId: ids.join(','),
    details: `Bulk deleted ${result.count} businesses`,
  })

  return NextResponse.json({ deleted: result.count })
}
