import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST: bulk update contact fields (email, phone, viberPhone) for multiple businesses
// Body: { updates: [{ afm: string, email?: string, phone?: string, viberPhone?: string }] }
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isAdmin = session.user.role === 'ADMIN'
  const accountantId = (session.user as any).accountantId

  const { updates } = await request.json()
  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ error: 'Δεν υπάρχουν δεδομένα προς ενημέρωση' }, { status: 400 })
  }

  let updated = 0
  let notFound = 0

  for (const row of updates) {
    const afm = String(row.afm || '').trim()
    if (!afm) continue

    const where = isAdmin ? { afm } : { afm, accountantId }
    const business = await prisma.business.findFirst({ where, select: { id: true } })
    if (!business) { notFound++; continue }

    const data: any = {}
    if (row.email !== undefined && row.email !== '') data.email = String(row.email).trim()
    if (row.phone !== undefined && row.phone !== '') data.phone = String(row.phone).trim()
    if (row.viberPhone !== undefined && row.viberPhone !== '') data.viberPhone = String(row.viberPhone).trim()

    if (Object.keys(data).length === 0) continue

    await prisma.business.update({ where: { id: business.id }, data })
    updated++
  }

  return NextResponse.json({ updated, notFound, total: updates.length })
}
