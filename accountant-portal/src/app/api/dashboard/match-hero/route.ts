import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Powers the dashboard's matches hero section: a live feed of the newest
// matches, plus a lightweight graph (programs + businesses + edges) for the
// network view. Both share the same accountant-scoping rules as /api/matches.
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isAdmin = session.user.role === 'ADMIN'
  const filterAccountantId = isAdmin ? request.nextUrl.searchParams.get('accountantId') || undefined : undefined
  const effectiveAccountantId = isAdmin ? filterAccountantId : (session.user.accountantId || undefined)

  const where = effectiveAccountantId ? { business: { accountantId: effectiveAccountantId } } : {}

  const [recentMatches, graphMatches] = await Promise.all([
    prisma.programMatch.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 12,
      include: {
        business: { select: { id: true, onomasia: true, afm: true } },
        program: { select: { id: true, title: true, category: true } },
      },
    }),
    prisma.programMatch.findMany({
      where,
      orderBy: { matchScore: 'desc' },
      take: 150,
      select: {
        matchScore: true,
        status: true,
        business: { select: { id: true, onomasia: true } },
        program: { select: { id: true, title: true, category: true } },
      },
    }),
  ])

  const feed = recentMatches.map(m => ({
    id: m.id,
    businessId: m.business.id,
    businessName: m.business.onomasia || m.business.afm,
    businessAfm: m.business.afm,
    programId: m.program.id,
    programTitle: m.program.title,
    programCategory: m.program.category,
    matchScore: m.matchScore,
    status: m.status,
    notified: m.notified,
    createdAt: m.createdAt,
  }))

  const programNodeIds = new Set<string>()
  const businessNodeIds = new Set<string>()
  const nodes: Array<{ id: string; label: string; type: 'program' | 'business'; category?: string | null }> = []
  const links: Array<{ source: string; target: string; score: number; status: string }> = []

  for (const m of graphMatches) {
    const programNodeId = `p:${m.program.id}`
    const businessNodeId = `b:${m.business.id}`
    if (!programNodeIds.has(programNodeId)) {
      programNodeIds.add(programNodeId)
      nodes.push({ id: programNodeId, label: m.program.title, type: 'program', category: m.program.category })
    }
    if (!businessNodeIds.has(businessNodeId)) {
      businessNodeIds.add(businessNodeId)
      nodes.push({ id: businessNodeId, label: m.business.onomasia || 'Επιχείρηση', type: 'business' })
    }
    links.push({ source: programNodeId, target: businessNodeId, score: m.matchScore, status: m.status })
  }

  return NextResponse.json({ feed, graph: { nodes, links } })
}
