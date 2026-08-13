import { prisma } from '@/lib/prisma'

export async function findApplicablePolicy(serviceName: string, stage: 'APPLICATION' | 'IMPLEMENTATION') {
  const stageFilter = stage === 'APPLICATION' ? { appliesToApplication: true } : { appliesToImplementation: true }

  // 1. Exact match by linked service name
  const byService = await prisma.commissionPolicy.findFirst({
    where: { active: true, ...stageFilter, service: { name: { equals: serviceName, mode: 'insensitive' } } },
  })
  if (byService) return byService

  // 2. Match by policy name or linked program title containing the service name stem
  // (handles cases like serviceName="ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ" matching policy "ΤΑΜΕΙΟ ΜΙΚΡΟΠΙΣΤΩΣΕΩΝ")
  const stem = serviceName.substring(0, Math.max(6, serviceName.length - 3))
  const byName = await (prisma.commissionPolicy as any).findFirst({
    where: {
      active: true, ...stageFilter,
      OR: [
        { name: { contains: stem, mode: 'insensitive' } },
        { programs: { some: { title: { contains: stem, mode: 'insensitive' } } } },
      ],
    },
  })
  if (byName) return byName

  // 3. Generic fallback — any active policy for this stage with no service link
  return prisma.commissionPolicy.findFirst({ where: { active: true, ...stageFilter, serviceId: null } })
}
