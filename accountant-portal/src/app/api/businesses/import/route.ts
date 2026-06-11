import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { runMatchingForBusiness, notifyBatchMatchesForBusinesses } from '@/lib/matching'
import * as XLSX from 'xlsx'

function applySoleProprietorFix(businessData: any) {
  let onomasia = businessData.onomasia || ''
  let legalStatusDescr = businessData.legalStatusDescr || ''

  // Natural persons (sole proprietors) come back from GSIS as
  // "ΕΠΩΝΥΜΟ ΟΝΟΜΑ ΠΑΤΡΩΝΥΜΟ" with no legal status — trim the patronymic
  // and label them as ΑΤΟΜΙΚΗ
  if (!legalStatusDescr) {
    const parts = onomasia.trim().split(/\s+/)
    if (parts.length >= 3) {
      onomasia = parts.slice(0, 2).join(' ')
    }
    legalStatusDescr = 'ΑΤΟΜΙΚΗ'
  }

  return { ...businessData, onomasia, legalStatusDescr }
}

function normalizePhone(value: any): string | null {
  if (value === undefined || value === null || value === '') return null
  // Numeric cells from Excel can render in scientific notation (e.g. 3,06972E+11)
  let raw = typeof value === 'number' ? value.toFixed(0) : String(value)
  let digits = raw.replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('0030')) digits = digits.slice(4)
  else if (digits.startsWith('30') && digits.length > 10) digits = digits.slice(2)
  return digits || null
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (session.user.role === 'ACCOUNTANT' && session.user.accountantId) {
    const accountant = await prisma.accountant.findUnique({ where: { id: session.user.accountantId }, select: { approved: true } })
    if (accountant && !accountant.approved) {
      return NextResponse.json({ error: 'Η εισαγωγή επιχειρήσεων μέσω ΑΑΔΕ θα ενεργοποιηθεί μόλις εγκριθεί ο λογαριασμός σας από την ομάδα της I-MENTOR.', pendingApproval: true }, { status: 403 })
    }
  }

  const formData = await request.formData()
  const file = formData.get('file') as File
  if (!file) return NextResponse.json({ error: 'Χωρίς αρχείο' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  let rows: any[] = []

  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    rows = XLSX.utils.sheet_to_json(sheet)
  } catch {
    // Try CSV
    const text = buffer.toString('utf-8')
    const lines = text.split('\n').filter(Boolean)
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
    rows = lines.slice(1).map(line => {
      const values = line.split(',')
      return Object.fromEntries(headers.map((h, i) => [h, values[i]?.trim()]))
    })
  }

  let created = 0
  let skipped = 0
  const accountantId = session.user.role === 'ACCOUNTANT' ? session.user.accountantId : null
  const importedBusinessIds: string[] = []

  for (const row of rows) {
    const afm = String(row.afm || row.ΑΦΜ || row.AFM || '').trim().replace(/\D/g, '')
    if (!afm || afm.length !== 9) { skipped++; continue }

    const phone = normalizePhone(row.tel ?? row.phone ?? row.τηλ ?? row.τηλέφωνο ?? row.ΤΗΛ ?? row.ΤΗΛΕΦΩΝΟ)
    const email = String(row.email || row.mail || row.Email || row.EMAIL || '').trim() || null

    // Accountants must not be able to overwrite a business already owned by another accountant
    if (accountantId) {
      const existing = await prisma.business.findUnique({ where: { afm }, select: { accountantId: true } })
      if (existing && existing.accountantId && existing.accountantId !== accountantId) { skipped++; continue }
    }

    try {
      // Try to fetch real data from GSIS
      let businessData: any = { afm }
      try {
        const res = await fetch(`${process.env.APP_URL || 'https://logistis.i-mentor.gr'}/api/afm?afm=${afm}`, {
          headers: { Cookie: request.headers.get('cookie') || '' }
        })
        if (res.ok) {
          const gsis = await res.json()
          businessData = applySoleProprietorFix({ ...businessData, ...gsis })
        } else {
          // No record in GSIS — most likely an individual, not a registered business
          businessData.legalStatusDescr = 'ΙΔΙΩΤΗΣ'
        }
      } catch {
        businessData.legalStatusDescr = 'ΙΔΙΩΤΗΣ'
      }

      const business = await prisma.business.upsert({
        where: { afm },
        update: {
          ...(phone ? { phone } : {}),
          ...(email ? { email } : {}),
          ...(businessData.deactivationFlag !== undefined ? { deactivationFlag: businessData.deactivationFlag || null } : {}),
          ...(businessData.deactivationFlagDescr !== undefined ? { deactivationFlagDescr: businessData.deactivationFlagDescr || null } : {}),
        },
        create: {
          afm,
          onomasia: businessData.onomasia || row.onomasia || null,
          commercialTitle: businessData.commercialTitle || null,
          legalStatusDescr: businessData.legalStatusDescr || null,
          regdate: businessData.regdate || null,
          postalAddress: businessData.postalAddress || null,
          postalAddressNo: businessData.postalAddressNo || null,
          postalZipCode: businessData.postalZipCode || null,
          postalAreaDescription: businessData.postalAreaDescription || null,
          doy: businessData.doy || null,
          doyDescr: businessData.doyDescr || null,
          deactivationFlag: businessData.deactivationFlag || null,
          deactivationFlagDescr: businessData.deactivationFlagDescr || null,
          phone,
          email,
          accountantId,
          activities: businessData.activities?.length ? {
            create: businessData.activities.map((a: any) => ({
              firmActCode: a.firmActCode,
              firmActDescr: a.firmActDescr,
              firmActKind: a.firmActKind ? parseInt(String(a.firmActKind)) : null,
              firmActKindDescr: a.firmActKindDescr,
            }))
          } : undefined
        }
      })

      importedBusinessIds.push(business.id)
      created++
    } catch {
      skipped++
    }
  }

  // Run matching for all imported businesses, then send ONE batched email
  // per program (not one per business) summarizing all newly-eligible clients.
  if (importedBusinessIds.length > 0) {
    Promise.all(importedBusinessIds.map(id => runMatchingForBusiness(id)))
      .then(() => notifyBatchMatchesForBusinesses(importedBusinessIds))
      .catch(err => console.error('[Matching] Batch match/notify for import failed:', err?.message))
  }

  return NextResponse.json({ created, skipped, total: rows.length })
}
