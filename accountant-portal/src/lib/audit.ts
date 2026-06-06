import { prisma } from './prisma'

export async function createAuditLog({
  userId,
  action,
  entity,
  entityId,
  details,
}: {
  userId: string
  action: string
  entity: string
  entityId?: string
  details?: string
}) {
  try {
    await prisma.auditLog.create({
      data: { userId, action, entity, entityId, details }
    })
  } catch (error) {
    console.error('Audit log error:', error)
  }
}
