import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { runMatchingForProgram } from '@/lib/matching'
import { runMatchingForAllGemi } from '@/lib/gemi-matching'

// Rematches every open program against the full Business table, AND every
// GEMI lead (GemiLookup) against all active programs. Unlike the
// per-program "match" endpoint, this covers everything at once — for when
// criteria changed in a way that doesn't go through a program save (e.g. a
// business-side bulk edit, or a shared matching-logic fix like a ΚΑΔ rule
// bug), or just to force a clean recheck of everything. The Business side
// and the GEMI side are two separate match tables (ProgramMatch vs
// GemiProgramMatch) computed by two separate engines that share the same
// ΚΑΔ/criteria logic, so both need to be re-run for a fix to fully apply.
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

  const gemi = await runMatchingForAllGemi().catch(err => {
    console.error('[rematch-all] GEMI rematch failed:', err?.message)
    return { processed: 0, totalNewMatches: 0, errors: 0 }
  })

  return NextResponse.json({
    programsProcessed: programs.length,
    totalNewMatches,
    results,
    gemiProcessed: gemi.processed,
    gemiNewMatches: gemi.totalNewMatches,
    gemiErrors: gemi.errors,
  })
}
