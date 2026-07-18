import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Trims sole-proprietor names from "SURNAME FIRSTNAME PATRONYMIC" → "SURNAME FIRSTNAME"
function cleanName(onomasia: string): string {
  const words = onomasia.split(/\s+/).filter(Boolean)
  if (words.length >= 3) return words.slice(0, 2).join(' ')
  return words.join(' ')
}

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

  // Find all enriched sole proprietors where onomasia still has 3+ words
  const records = await prisma.gemiLookup.findMany({
    where: {
      aadeEnriched: true,
      legalStatusDescr: { contains: 'ΑΤΟΜΙΚ' },
    },
    select: { id: true, onomasia: true },
  })

  let fixed = 0
  for (const r of records) {
    if (!r.onomasia) continue
    const words = r.onomasia.trim().split(/\s+/).filter(Boolean)
    if (words.length < 3) continue // already clean
    const cleaned = cleanName(r.onomasia)
    await prisma.gemiLookup.update({ where: { id: r.id }, data: { onomasia: cleaned } })
    fixed++
  }

  return NextResponse.json({ checked: records.length, fixed })
}
