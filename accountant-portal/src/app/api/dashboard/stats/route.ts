import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isAdmin = session.user.role === 'ADMIN'
  const accountantId = session.user.accountantId

  const businessWhere = isAdmin ? {} : { accountantId: accountantId || undefined }

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
    prisma.business.count({ where: businessWhere }),
    prisma.program.count({ where: { active: true } }),
    prisma.programMatch.count({
      where: isAdmin ? {} : { business: { accountantId: accountantId || undefined } }
    }),
    prisma.campaign.count({ where: { status: 'SENT' } }),
    prisma.imentorRequest.count({
      where: {
        status: 'NEW',
        ...(isAdmin ? {} : { accountantId: accountantId || undefined }),
      }
    }),
    prisma.business.findMany({
      where: businessWhere,
      select: {
        postalAreaDescription: true,
        activities: {
          where: { firmActKind: 1 },
          select: { firmActCode: true },
          take: 1,
        }
      }
    }),
    prisma.programMatch.groupBy({
      by: ['programId'],
      _count: true,
      where: isAdmin ? {} : { business: { accountantId: accountantId || undefined } },
    }),
  ])

  // Group by KAD category (first 2 digits)
  const kadGroups: Record<string, number> = {}
  for (const b of businesses) {
    const kad = b.activities[0]?.firmActCode
    if (kad) {
      const prefix = kad.split('.')[0] || kad.slice(0, 2)
      kadGroups[prefix] = (kadGroups[prefix] || 0) + 1
    }
  }
  const businessesByCategory = Object.entries(kadGroups)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }))

  // Group by region
  const regionGroups: Record<string, number> = {}
  for (const b of businesses) {
    const region = b.postalAreaDescription || 'Άγνωστη'
    regionGroups[region] = (regionGroups[region] || 0) + 1
  }
  const businessesByRegion = Object.entries(regionGroups)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
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
    businessesByCategory,
    businessesByRegion,
    matchesByProgram: matchesByProgramFormatted,
  })
}
