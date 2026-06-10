import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveRegionFromZip } from '@/lib/greek-regions'
import { notIndividualWhere } from '@/lib/business-filters'
import { categorizeByKad } from '@/lib/business-categories'

// Collapses equivalent legal-form variants into a single canonical label for the chart
function normalizeLegalStatus(status: string): string {
  const s = status.toUpperCase()
  if (s.includes('ΙΔΙΩΤΙΚΗ ΚΕΦΑΛΑΙΟΥΧΙΚΗ ΕΤΑΙΡΕΙΑ')) return 'ΙΚΕ'
  if (s === 'ΟΕ' || s === 'ΕΕ' || s.includes('ΟΜΟΡΡΥΘΜΗ ΕΤΑΙΡΕΙΑ') || s.includes('ΕΤΕΡΟΡΡΥΘΜΗ ΕΤΑΙΡΕΙΑ')) return 'ΟΕ/ΕΕ'
  return status
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isAdmin = session.user.role === 'ADMIN'
  const accountantId = session.user.accountantId
  const filterAccountantId = isAdmin ? request.nextUrl.searchParams.get('accountantId') || undefined : undefined
  const effectiveAccountantId = isAdmin ? filterAccountantId : (accountantId || undefined)

  const businessWhere = effectiveAccountantId ? { accountantId: effectiveAccountantId } : {}
  const realBusinessWhere = { ...businessWhere, ...notIndividualWhere }
  const matchAccountantWhere = effectiveAccountantId ? { business: { accountantId: effectiveAccountantId } } : {}

  const [
    totalAccountants,
    totalBusinesses,
    activePrograms,
    totalMatches,
    campaignsSent,
    pendingRequests,
    businesses,
    matchesByProgram,
  ] = await Promise.all([
    isAdmin ? prisma.accountant.count() : Promise.resolve(undefined),
    prisma.business.count({ where: realBusinessWhere }),
    prisma.program.count({ where: { active: true } }),
    prisma.programMatch.count({ where: matchAccountantWhere }),
    prisma.campaign.count({ where: { status: 'SENT', ...(effectiveAccountantId ? { accountantId: effectiveAccountantId } : {}) } }),
    prisma.imentorRequest.count({
      where: {
        status: 'NEW',
        ...(effectiveAccountantId ? { accountantId: effectiveAccountantId } : {}),
      }
    }),
    prisma.business.findMany({
      where: realBusinessWhere,
      select: {
        postalAreaDescription: true,
        postalZipCode: true,
        legalStatusDescr: true,
        activities: { where: { firmActKind: 1 }, select: { firmActCode: true }, take: 1 },
      }
    }),
    prisma.programMatch.groupBy({
      by: ['programId'],
      _count: true,
      where: matchAccountantWhere,
    }),
  ])

  // Group by legal status (Νομική Μορφή), normalizing equivalent forms into one label
  const legalStatusGroups: Record<string, number> = {}
  for (const b of businesses) {
    const status = normalizeLegalStatus(b.legalStatusDescr || 'Άγνωστη')
    legalStatusGroups[status] = (legalStatusGroups[status] || 0) + 1
  }
  const businessesByLegalStatus = Object.entries(legalStatusGroups)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }))

  // Group by Περιφέρεια (resolved from postal ZIP code prefix)
  const regionGroups: Record<string, number> = {}
  for (const b of businesses) {
    const region = resolveRegionFromZip(b.postalZipCode) || 'Άγνωστη'
    regionGroups[region] = (regionGroups[region] || 0) + 1
  }
  const businessesByRegion = Object.entries(regionGroups)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 14)
    .map(([name, count]) => ({ name, count }))

  // Group by major business category, derived from the primary ΚΑΔ
  const categoryGroups: Record<string, number> = {}
  for (const b of businesses) {
    const category = categorizeByKad(b.activities[0]?.firmActCode)
    categoryGroups[category] = (categoryGroups[category] || 0) + 1
  }
  const businessesByCategory = Object.entries(categoryGroups)
    .sort(([, a], [, b]) => b - a)
    .map(([name, count]) => ({ name, count }))

  // Matches by program
  const programIds = matchesByProgram.map(m => m.programId)
  const programs = await prisma.program.findMany({
    where: { id: { in: programIds } },
    select: { id: true, title: true }
  })
  const programMap = Object.fromEntries(programs.map(p => [p.id, p.title]))
  const matchesByProgramFormatted = matchesByProgram.map(m => ({
    name: programMap[m.programId]?.slice(0, 30) || m.programId,
    count: m._count,
  }))

  return NextResponse.json({
    totalAccountants,
    totalBusinesses,
    activePrograms,
    totalMatches,
    campaignsSent,
    pendingRequests,
    businessesByLegalStatus,
    businessesByCategory,
    businessesByRegion,
    matchesByProgram: matchesByProgramFormatted,
  })
}
