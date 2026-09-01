/**
 * Safe deduplication script for ClientCase pairs created by the CM double-callback bug.
 *
 * Identifies pairs where:
 *   - Same businessId
 *   - Created within 48 hours of each other
 *   - One has a programId (the "primary"), one does not (the "generic")
 *   - The generic has status ACCEPTED and requestType OTHER
 *
 * Run dry-run first:
 *   npx tsx scripts/merge-duplicate-cases.ts
 *
 * Then apply:
 *   npx tsx scripts/merge-duplicate-cases.ts --apply
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const DRY_RUN = !process.argv.includes('--apply')

async function main() {
  console.log(DRY_RUN ? '🔍 DRY RUN — no changes will be made' : '⚠️  APPLY MODE — changes will be written to the database')
  console.log()

  // Find all cases grouped by businessId, created in the last 90 days to limit scope
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)

  const cases = await prisma.clientCase.findMany({
    where: { createdAt: { gte: since } },
    include: {
      activities: { orderBy: { createdAt: 'asc' } },
      business: { select: { onomasia: true, afm: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  // Group by businessId
  const byBusiness = new Map<string, typeof cases>()
  for (const c of cases) {
    const group = byBusiness.get(c.businessId) ?? []
    group.push(c)
    byBusiness.set(c.businessId, group)
  }

  const pairs: Array<{ primary: typeof cases[0]; generic: typeof cases[0] }> = []

  for (const [, group] of byBusiness) {
    if (group.length < 2) continue

    // Look for pairs: one with programId, one without, created within 48h of each other
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]
        const b = group[j]

        const timeDiffMs = Math.abs(a.createdAt.getTime() - b.createdAt.getTime())
        if (timeDiffMs > 48 * 60 * 60 * 1000) continue

        // One must have a programId, one must not
        const withProgram = a.programId ? a : b.programId ? b : null
        const withoutProgram = !a.programId ? a : !b.programId ? b : null
        if (!withProgram || !withoutProgram) continue

        // The generic one should be requestType OTHER and status ACCEPTED
        if (withoutProgram.requestType !== 'OTHER') continue
        if (withoutProgram.status !== 'ACCEPTED') continue

        // Avoid double-counting: skip if this generic is already in a pair
        if (pairs.some(p => p.generic.id === withoutProgram.id || p.primary.id === withProgram.id)) continue

        pairs.push({ primary: withProgram, generic: withoutProgram })
      }
    }
  }

  if (pairs.length === 0) {
    console.log('✅ No duplicate pairs found.')
    return
  }

  console.log(`Found ${pairs.length} duplicate pair(s):\n`)

  for (const { primary, generic } of pairs) {
    const biz = primary.business
    console.log(`  Business: ${biz?.onomasia || biz?.afm}`)
    console.log(`    PRIMARY  #${primary.caseNumber}  status=${primary.status}  program=${primary.programId ?? '—'}  externalRef=${primary.externalRef ?? '—'}`)
    console.log(`    GENERIC  #${generic.caseNumber}  status=${generic.status}  externalRef=${generic.externalRef ?? '—'}  activities=${generic.activities.length}`)

    const willCopyRef = !primary.externalRef && !!generic.externalRef
    const willMoveActivities = generic.activities.length > 0
    console.log(`    → Will copy externalRef: ${willCopyRef ? generic.externalRef : 'no (primary already has one or generic has none)'}`)
    console.log(`    → Will move ${generic.activities.length} activit${generic.activities.length === 1 ? 'y' : 'ies'} to primary`)
    console.log(`    → Will delete generic case #${generic.caseNumber}`)
    console.log()
  }

  if (DRY_RUN) {
    console.log('✋ Dry run complete. Run with --apply to execute.')
    return
  }

  // APPLY
  let merged = 0
  for (const { primary, generic } of pairs) {
    console.log(`Merging #${generic.caseNumber} → #${primary.caseNumber} ...`)

    await prisma.$transaction(async (tx) => {
      // 1. Move activities from generic to primary
      if (generic.activities.length > 0) {
        await tx.caseActivity.updateMany({
          where: { caseId: generic.id },
          data: { caseId: primary.id },
        })
      }

      // 2. Copy externalRef/externalStatus if primary doesn't have one
      const patch: Record<string, unknown> = {}
      if (!primary.externalRef && generic.externalRef) {
        patch.externalRef = generic.externalRef
        patch.externalSyncedAt = generic.externalSyncedAt
      }
      if (!primary.externalStatus && generic.externalStatus) {
        patch.externalStatus = generic.externalStatus
      }
      if (generic.status === 'ACCEPTED' && primary.status === 'NEW') {
        patch.status = 'ACCEPTED'
      }
      if (Object.keys(patch).length > 0) {
        await tx.clientCase.update({ where: { id: primary.id }, data: patch })
      }

      // 3. Delete generic case (activities already moved)
      await tx.clientCase.delete({ where: { id: generic.id } })
    })

    console.log(`  ✅ Done — #${generic.caseNumber} merged into #${primary.caseNumber}`)
    merged++
  }

  console.log(`\n✅ Merged ${merged} pair(s) successfully.`)
}

main()
  .catch(err => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
