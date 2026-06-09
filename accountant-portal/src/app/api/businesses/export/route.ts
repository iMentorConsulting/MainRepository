import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import * as XLSX from 'xlsx'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const where: any = {}

  const businesses = await prisma.business.findMany({
    where,
    include: { accountant: true, activities: true },
    orderBy: { createdAt: 'desc' },
  })

  const data = businesses.map(b => ({
    'ΑΦΜ': b.afm,
    'Επωνυμία': b.onomasia || '',
    'Εμπορικός Τίτλος': b.commercialTitle || '',
    'Νομική Μορφή': b.legalStatusDescr || '',
    'Ημ. Ίδρυσης': b.regdate || '',
    'Διεύθυνση': `${b.postalAddress || ''} ${b.postalAddressNo || ''}`.trim(),
    'ΤΚ': b.postalZipCode || '',
    'Περιοχή': b.postalAreaDescription || '',
    'ΔΟΥ': b.doyDescr || '',
    'Email': b.email || '',
    'Τηλέφωνο': b.phone || '',
    'Viber': b.viberPhone || '',
    'Κύρια ΚΑΔ': b.activities.find(a => a.firmActKind === 1)?.firmActCode || '',
    'Λογιστής': b.accountant?.officeName || '',
    'Tags': b.tags.join(', '),
    'Σημειώσεις': b.notes || '',
    'Εισαγωγή': b.createdAt.toLocaleDateString('el-GR'),
  }))

  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Επιχειρήσεις')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename=businesses.xlsx',
    }
  })
}
