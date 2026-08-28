import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ gemiId: string }> },
) {
  const { gemiId } = await params
  const gemi = await prisma.gemiLookup.findUnique({
    where: { id: gemiId },
    select: { onomasia: true, afm: true },
  })
  if (!gemi) return NextResponse.json({ error: 'Δεν βρέθηκε' }, { status: 404 })
  return NextResponse.json({ business: { name: gemi.onomasia || gemi.afm } })
}
