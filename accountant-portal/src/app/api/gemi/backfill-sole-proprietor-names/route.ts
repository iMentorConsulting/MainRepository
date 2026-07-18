import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// AADE sometimes doesn't return legalStatusDescr for individuals — detect by both
// legalStatusDescr containing ΑΤΟΜΙΚ OR onomasia looking like "SURNAME FIRSTNAME PATRONYMIC"
function isSoleProprietorName(onomasia: string, legalStatusDescr: string | null | undefined): boolean {
  if (legalStatusDescr?.toUpperCase().includes('ΑΤΟΜΙΚ')) return true
  // AADE returns individual names as 3 ALL-CAPS Greek words (surname firstname patronymic)
  const words = onomasia.trim().split(/\s+/).filter(Boolean)
  if (words.length < 3) return false
  // All words should be uppercase Greek letters only (no digits, no Latin)
  return words.every(w => /^[ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩΆΈΉΊΌΎΏ]+$/.test(w))
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

  const records = await prisma.gemiLookup.findMany({
    where: { aadeEnriched: true },
    select: { id: true, onomasia: true, legalStatusDescr: true },
  })

  let fixed = 0
  const samples: string[] = []

  for (const r of records) {
    if (!r.onomasia) continue
    const words = r.onomasia.trim().split(/\s+/).filter(Boolean)
    if (words.length < 3) continue
    if (!isSoleProprietorName(r.onomasia, r.legalStatusDescr)) continue

    const cleaned = words.slice(0, 2).join(' ')
    if (samples.length < 5) samples.push(`${r.onomasia} → ${cleaned}`)
    await prisma.gemiLookup.update({ where: { id: r.id }, data: { onomasia: cleaned } })
    fixed++
  }

  return NextResponse.json({ checked: records.length, fixed, samples })
}
