import { prisma } from '@/lib/prisma'

export async function findApplicablePolicy(serviceName: string, stage: 'APPLICATION' | 'IMPLEMENTATION') {
  const stageFilter = stage === 'APPLICATION' ? { appliesToApplication: true } : { appliesToImplementation: true }
  const byService = await prisma.commissionPolicy.findFirst({
    where: { active: true, ...stageFilter, service: { name: { equals: serviceName, mode: 'insensitive' } } },
  })
  if (byService) return byService
  return prisma.commissionPolicy.findFirst({ where: { active: true, ...stageFilter, serviceId: null } })
}
