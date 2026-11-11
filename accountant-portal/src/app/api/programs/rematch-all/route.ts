import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { runMatchingForProgram } from '@/lib/matching'

// Rematches every open program against the full Business table. Unlike the
// per-program "match" endpoint, this covers everything at once — for when
// criteria changed in a way that doesn't go through a program save (e.g. a
// business-side bulk edit), or just to force a clean recheck of everything.
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const programs = await prisma.program.findMany({
    where: { active: true, archived: false },
    select: { id: true, title: true },
  })

  let totalNewMatches = 0
  const results: { id: string; title: string; newMatches: number; error?: string }[] = []

  for (const program of programs) {
    try {
      const count = await runMatchingForProgram(program.id)
      totalNewMatches += count
      results.push({ id: program.id, title: program.title, newMatches: count })
    } catch (err: any) {
      results.push({ id: program.id, title: program.title, newMatches: 0, error: err?.message || 'Σφάλμα' })
    }
  }

  return NextResponse.json({ programsProcessed: programs.length, totalNewMatches, results })
}
