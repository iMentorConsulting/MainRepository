import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accountantId = session.user.role === 'ACCOUNTANT'
    ? (session.user as any).accountantId ?? null
    : null

  const bizWhere = accountantId ? { accountantId } : {}
  const campWhere = accountantId ? { accountantId } : {}

  // All businesses (for growth + scoring)
  const businesses = await prisma.business.findMany({
    where: bizWhere,
    select: { createdAt: true, email: true, phone: true },
    orderBy: { createdAt: 'asc' },
  })

  // Growth: group by month, cumulative
  const monthMap: Record<string, number> = {}
  for (const b of businesses) {
    const key = b.createdAt.toISOString().slice(0, 7)
    monthMap[key] = (monthMap[key] || 0) + 1
  }
  let running = 0
  const growth = Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, added]) => {
      running += added
      return { month, added, total: running }
    })

  // Scoring inputs
  const totalBusinesses = businesses.length
  const withContact = businesses.filter(b => b.email || b.phone).length

  const [businessesWithMatches, campaignsSent] = await Promise.all([
    prisma.business.count({ where: { ...bizWhere, programMatches: { some: {} } } }),
    prisma.campaign.count({ where: { ...campWhere, status: 'SENT' } }),
  ])

  const matchRate = totalBusinesses > 0 ? businessesWithMatches / totalBusinesses : 0
  const contactRate = totalBusinesses > 0 ? withContact / totalBusinesses : 0

  const volumeScore   = Math.min(30, Math.round((Math.min(totalBusinesses, 200) / 200) * 30))
  const matchScore    = Math.round(matchRate * 25)
  const campaignScore = Math.min(25, Math.round((Math.min(campaignsSent, 10) / 10) * 25))
  const dataScore     = Math.round(contactRate * 20)
  const totalScore    = volumeScore + matchScore + campaignScore + dataScore

  // Campaign history
  const campaigns = await prisma.campaign.findMany({
    where: campWhere,
    include: {
      program: { select: { title: true } },
      _count: { select: { recipients: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return NextResponse.json({
    growth,
    score: {
      total: totalScore,
      breakdown: {
        volume:    { score: volumeScore,   max: 30, value: totalBusinesses,                    label: 'Επιχειρήσεις' },
        matching:  { score: matchScore,    max: 25, value: Math.round(matchRate * 100),         label: 'Ποσοστό Matching' },
        campaigns: { score: campaignScore, max: 25, value: campaignsSent,                      label: 'Καμπάνιες που εστάλησαν' },
        data:      { score: dataScore,     max: 20, value: Math.round(contactRate * 100),       label: 'Πληρότητα Στοιχείων' },
      },
    },
    campaigns: campaigns.map(c => ({
      id: c.id,
      title: c.title,
      status: c.status,
      channel: c.channel,
      program: c.program?.title ?? null,
      recipients: c._count.recipients,
      sentAt: c.sentAt,
      createdAt: c.createdAt,
    })),
  })
}
