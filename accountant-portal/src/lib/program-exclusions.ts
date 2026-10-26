import { prisma } from '@/lib/prisma'

// Shared by /api/matches and /api/dashboard/match-hero so both always agree
// on which ProgramMatch rows a program's own excludeTags/requireTags/
// excludedLegalForms rules rule out. Previously match-hero re-implemented
// this as a JS post-filter over a separately-fetched business/program
// shape; the two silently diverged in production (match-hero showing many
// more "suitable" matches than the table actually returned for the same
// accountant+program), so this is now the single source of truth, applied
// as a Prisma where-clause by both routes.
export async function getProgramExclusionFilters() {
  const [programsWithTagRules, programsWithExcludedLegalForms] = await Promise.all([
    prisma.program.findMany({
      where: { OR: [{ excludeTags: { isEmpty: false } }, { requireTags: { isEmpty: false } }] },
      select: { id: true, excludeTags: true, requireTags: true },
    }),
    prisma.program.findMany({
      where: { excludedLegalForms: { isEmpty: false } },
      select: { id: true, excludedLegalForms: true },
    }),
  ])

  let excludeTagsFilter: any = null
  let requireTagsFilter: any = null

  const excludePrograms = programsWithTagRules.filter(p => p.excludeTags.length > 0)
  if (excludePrograms.length > 0) {
    excludeTagsFilter = {
      NOT: {
        OR: excludePrograms.map(p => ({
          programId: p.id,
          business: { tags: { hasSome: p.excludeTags } },
        })),
      },
    }
  }

  const requirePrograms = programsWithTagRules.filter(p => p.requireTags.length > 0)
  if (requirePrograms.length > 0) {
    requireTagsFilter = {
      OR: [
        { programId: { notIn: requirePrograms.map(p => p.id) } },
        ...requirePrograms.map(p => ({
          programId: p.id,
          business: { tags: { hasSome: p.requireTags } },
        })),
      ],
    }
  }

  // normalizeLegalForm is identity for non-null trimmed strings; 'ΙΔΙΩΤΗΣ' maps
  // to null/empty. Express this via a nested relation instead of pairs.
  let legalFormExcludeFilter: any = null
  if (programsWithExcludedLegalForms.length > 0) {
    const conditions = programsWithExcludedLegalForms.flatMap(p =>
      p.excludedLegalForms.map(form =>
        form === 'ΙΔΙΩΤΗΣ'
          ? { programId: p.id, business: { OR: [{ legalStatusDescr: null }, { legalStatusDescr: '' }, { legalStatusDescr: 'ΙΔΙΩΤΗΣ' }] } }
          : { programId: p.id, business: { legalStatusDescr: form } }
      )
    )
    if (conditions.length > 0) legalFormExcludeFilter = { NOT: { OR: conditions } }
  }

  // Programs whose matches need the filters above applied — the bulk facet
  // groupBy in /api/matches skips these to stay a cheap single scan.
  const affectedProgramIds = Array.from(new Set([
    ...excludePrograms.map(p => p.id),
    ...requirePrograms.map(p => p.id),
    ...programsWithExcludedLegalForms.map(p => p.id),
  ]))

  return { excludeTagsFilter, requireTagsFilter, legalFormExcludeFilter, affectedProgramIds }
}

export function withProgramExclusions(w: any, filters: Awaited<ReturnType<typeof getProgramExclusionFilters>>) {
  let result = w
  if (filters.excludeTagsFilter) result = { ...result, AND: [...(result.AND || []), filters.excludeTagsFilter] }
  if (filters.requireTagsFilter) result = { ...result, AND: [...(result.AND || []), filters.requireTagsFilter] }
  if (filters.legalFormExcludeFilter) result = { ...result, AND: [...(result.AND || []), filters.legalFormExcludeFilter] }
  return result
}
