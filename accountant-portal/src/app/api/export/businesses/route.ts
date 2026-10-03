import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isAdmin = session.user.role === 'ADMIN'
  const accountantId = (session.user as any).accountantId as string | null

  // Businesses
  const businesses = await prisma.business.findMany({
    where: isAdmin ? {} : { accountantId: accountantId ?? '__none__' },
    include: {
      activities: { where: { firmActKind: 1 }, take: 1 },
      accountant: { select: { officeName: true } },
      campaignRecipients: {
        select: {
          sentAt: true,
          channel: true,
          status: true,
          campaign: { select: { title: true } },
        },
        orderBy: { sentAt: 'desc' },
        take: 3,
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  // Build CSV-style rows
  const rows: string[][] = []
  rows.push([
    'ΑΦΜ', 'Επωνυμία', 'Email', 'Τηλέφωνο', 'Viber',
    'Περιοχή', 'ΤΚ', 'Κύρια ΚΑΔ', 'Λογιστής',
    'Τελ. Καμπάνια', 'Ημ/νία Καμπάνιας', 'Κανάλι', 'Status',
  ])

  for (const b of businesses) {
    const lastCamp = b.campaignRecipients[0]
    rows.push([
      b.afm,
      b.onomasia || '',
      b.email || '',
      b.phone || '',
      b.viberPhone || '',
      b.postalAreaDescription || '',
      b.postalZipCode || '',
      b.activities[0]?.firmActCode || '',
      b.accountant?.officeName || '',
      lastCamp?.campaign?.title || '',
      lastCamp?.sentAt ? new Date(lastCamp.sentAt).toLocaleDateString('el-GR') : '',
      lastCamp?.channel || '',
      lastCamp?.status || '',
    ])
  }

  // Generate XLSX
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [
    { wch: 12 }, { wch: 32 }, { wch: 28 }, { wch: 14 }, { wch: 14 },
    { wch: 18 }, { wch: 8 }, { wch: 14 }, { wch: 24 },
    { wch: 28 }, { wch: 14 }, { wch: 10 }, { wch: 10 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Επιχειρήσεις')
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="export-epiheiriseis-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  })
}
