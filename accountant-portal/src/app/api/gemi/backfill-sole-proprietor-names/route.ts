import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`
  if (!isCron) {
    const session = await auth()
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  // Same logic as applySoleProprietorFix in businesses/import:
  // sole proprietors have no legalStatusDescr from AADE and a 3-word name
  const records = await prisma.gemiLookup.findMany({
    where: {
      aadeEnriched: true,
      OR: [
        { legalStatusDescr: null },
        { legalStatusDescr: 'ΑΤΟΜΙΚΗ' },
      ],
    },
    select: { id: true, onomasia: true, legalStatusDescr: true },
  })

  let fixed = 0
  const samples: string[] = []

  for (const r of records) {
    if (!r.onomasia) continue
    const parts = r.onomasia.trim().split(/\s+/).filter(Boolean)
    if (parts.length < 3) continue

    const cleaned = parts.slice(0, 2).join(' ')
    if (samples.length < 10) samples.push(`${r.onomasia} → ${cleaned}`)
    await prisma.gemiLookup.update({
      where: { id: r.id },
      data: { onomasia: cleaned, legalStatusDescr: 'ΑΤΟΜΙΚΗ' },
    })
    fixed++
  }

  return NextResponse.json({ checked: records.length, fixed, samples })
}
