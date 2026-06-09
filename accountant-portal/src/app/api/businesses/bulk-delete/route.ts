import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const isAdmin = session.user.role === 'ADMIN'
  const accountantId = (session.user as any).accountantId

  const { ids } = await request.json()
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'Δεν επιλέχθηκαν επιχειρήσεις' }, { status: 400 })
  }

  const where = isAdmin
    ? { id: { in: ids } }
    : { id: { in: ids }, accountantId }

  const result = await prisma.business.deleteMany({ where })

  await createAuditLog({
    userId: session.user.id,
    action: 'BULK_DELETE',
    entity: 'Business',
    entityId: ids.join(','),
    details: `Bulk deleted ${result.count} businesses`,
  })

  return NextResponse.json({ deleted: result.count })
}
