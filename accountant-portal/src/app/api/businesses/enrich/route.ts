import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import * as XLSX from 'xlsx'

const AFM_HEADERS = ['afm', 'a.f.m', 'a.f.m.', 'vat', 'αφμ', 'α.φ.μ', 'α.φ.μ.']
const PHONE_HEADERS = [
  'κινητο', 'κινητό', 'κινητου', 'κινητού', 'tel', 'τηλ', 'τηλεφωνο', 'τηλέφωνο', 'τηλ κινητο', 'τηλ κινητό',
  'kinito', 'kinhto', 'mobile', 'mobileno', 'mobile no', 'mobilephone', 'mobile phone', 'cell', 'cellphone', 'cell phone', 'phone',
]
const EMAIL_HEADERS = ['email', 'e-mail', 'mail']
const VIBER_HEADERS = ['viber']

function normalizeHeader(h: string): string {
  return String(h || '').trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ')
}

function findKey(row: Record<string, any>, candidates: string[]): string | undefined {
  const keys = Object.keys(row)
  return keys.find(k => candidates.includes(normalizeHeader(k)))
}

// Returns digits-only mobile number, or null if missing/invalid/landline.
// Greek mobile numbers are 10 digits starting with 69.
function normalizeMobile(value: any): string | null {
  if (value === undefined || value === null || value === '') return null
  let raw = typeof value === 'number' ? value.toFixed(0) : String(value)
  let digits = raw.replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('0030')) digits = digits.slice(4)
  else if (digits.startsWith('30') && digits.length > 10) digits = digits.slice(2)
  if (digits.length !== 10 || !digits.startsWith('69')) return null
  return digits
}

// POST: bulk update contact fields (email, phone, viberPhone) for multiple businesses
// Body: { fileData: string (data URL) } or { updates: [{ afm, email?, phone?, viberPhone? }] }
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isAdmin = session.user.role === 'ADMIN'
  const accountantId = (session.user as any).accountantId

  const body = await request.json()
  let updates: any[] = Array.isArray(body.updates) ? body.updates : []

  if (body.fileData) {
    const base64 = String(body.fileData).split(',').pop() || ''
    const buffer = Buffer.from(base64, 'base64')
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet)

    updates = rows.map(row => {
      const afmKey = findKey(row, AFM_HEADERS)
      const phoneKey = findKey(row, PHONE_HEADERS)
      const emailKey = findKey(row, EMAIL_HEADERS)
      const viberKey = findKey(row, VIBER_HEADERS)
      return {
        afm: afmKey ? row[afmKey] : undefined,
        phone: phoneKey ? normalizeMobile(row[phoneKey]) ?? undefined : undefined,
        email: emailKey ? row[emailKey] : undefined,
        viberPhone: viberKey ? normalizeMobile(row[viberKey]) ?? undefined : undefined,
      }
    })
  }

  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ error: 'Δεν υπάρχουν δεδομένα προς ενημέρωση' }, { status: 400 })
  }

  let updated = 0
  let notFound = 0

  for (const row of updates) {
    const afm = String(row.afm || '').replace(/\D/g, '').trim()
    if (!afm) continue

    const where = isAdmin ? { afm } : { afm, accountantId }
    const business = await prisma.business.findFirst({ where, select: { id: true } })
    if (!business) { notFound++; continue }

    const data: any = {}
    if (row.email !== undefined && row.email !== '' && row.email !== null) data.email = String(row.email).trim()
    if (row.phone !== undefined && row.phone !== '' && row.phone !== null) data.phone = String(row.phone).trim()
    if (row.viberPhone !== undefined && row.viberPhone !== '' && row.viberPhone !== null) data.viberPhone = String(row.viberPhone).trim()

    if (Object.keys(data).length === 0) continue

    await prisma.business.update({ where: { id: business.id }, data })
    updated++
  }

  return NextResponse.json({ updated, notFound, total: updates.length })
}
