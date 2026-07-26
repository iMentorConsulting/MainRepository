import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import * as XLSX from 'xlsx'

type Params = { params: Promise<{ token: string }> }

async function resolveToken(token: string) {
  const row = await prisma.matchActionToken.findUnique({
    where: { token },
    select: { accountantId: true, programId: true, expiresAt: true },
  })
  if (!row) return null
  if (row.expiresAt < new Date()) return null
  return row
}

// GET — download xlsx template (pre-filled name + AFM, blank email/phone)
// ?scope=matches  → only uncontacted businesses matched to this program (default)
// ?scope=all      → all accountant businesses without contact info
export async function GET(req: NextRequest, { params }: Params) {
  const { token } = await params
  const row = await resolveToken(token)
  if (!row) return NextResponse.json({ error: 'Ο σύνδεσμος δεν ισχύει ή έχει λήξει.' }, { status: 404 })

  const scope = req.nextUrl.searchParams.get('scope') ?? 'matches'

  let businesses: Array<{ onomasia: string | null; afm: string }>

  if (scope === 'all') {
    businesses = await prisma.business.findMany({
      where: {
        accountantId: row.accountantId,
        OR: [{ email: null }, { email: '' }, { phone: null }, { phone: '' }],
        AND: [
          { OR: [{ email: null }, { email: '' }] },
          { OR: [{ phone: null }, { phone: '' }] },
        ],
      },
      select: { onomasia: true, afm: true },
      orderBy: { onomasia: 'asc' },
    })
  } else {
    // matches scope: businesses matched to this program, not already having contact info, not already assigned
    const matches = await prisma.programMatch.findMany({
      where: {
        programId: row.programId,
        business: {
          accountantId: row.accountantId,
          AND: [
            { OR: [{ email: null }, { email: '' }] },
            { OR: [{ phone: null }, { phone: '' }] },
          ],
        },
        status: { not: 'REJECTED' },
      },
      select: { business: { select: { onomasia: true, afm: true } } },
      orderBy: { business: { onomasia: 'asc' } },
    })
    businesses = matches.map((m: { business: { onomasia: string | null; afm: string } }) => m.business)
  }

  const rows = businesses.map(b => ({
    'Επωνυμία': b.onomasia ?? '',
    'ΑΦΜ': b.afm,
    'Email': '',
    'Κινητό': '',
  }))

  const ws = XLSX.utils.json_to_sheet(rows)
  // Column widths
  ws['!cols'] = [{ wch: 40 }, { wch: 14 }, { wch: 30 }, { wch: 16 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Πελάτες')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="pelates-stoixeia-${scope}.xlsx"`,
    },
  })
}

// POST — parse uploaded xlsx, return { updates: [{ afm, email, phone }] }
export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params
  const row = await resolveToken(token)
  if (!row) return NextResponse.json({ error: 'Ο σύνδεσμος δεν ισχύει ή έχει λήξει.' }, { status: 404 })

  let buf: Buffer
  try {
    const formData = await req.formData()
    const file = formData.get('file')
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'Δεν βρέθηκε αρχείο.' }, { status: 400 })
    }
    const arrayBuf = await (file as File).arrayBuffer()
    buf = Buffer.from(arrayBuf)
  } catch {
    return NextResponse.json({ error: 'Σφάλμα ανάγνωσης αρχείου.' }, { status: 400 })
  }

  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(buf, { type: 'buffer' })
  } catch {
    return NextResponse.json({ error: 'Μη έγκυρο αρχείο Excel.' }, { status: 400 })
  }

  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

  const updates: Array<{ afm: string; email: string; phone: string }> = []

  for (const row of rows) {
    const afm = String(row['ΑΦΜ'] ?? row['afm'] ?? '').trim().replace(/\D/g, '').padStart(9, '0')
    const email = String(row['Email'] ?? row['email'] ?? '').trim()
    const phone = String(row['Κινητό'] ?? row['phone'] ?? row['Κινητό'] ?? '').trim()
    if (!afm || afm === '000000000') continue
    if (!email && !phone) continue
    updates.push({ afm, email, phone })
  }

  return NextResponse.json({ updates })
}
