import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function checkApiKey(request: NextRequest): boolean {
  const key = process.env.CASES_API_KEY
  return !!key && request.headers.get('x-api-key') === key
}

// POST /api/external/widget-sessions
// Create a per-client tokenized eligibility widget link.
// Body: { afm, clientName?, email?, phone?, leadRef?, expiresInDays? }
// Response: { token, url }
export async function POST(request: NextRequest) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { afm, clientName, email, phone, leadRef, expiresInDays } = await request.json()
  if (!afm) return NextResponse.json({ error: 'afm is required' }, { status: 400 })

  const cleanAfm = String(afm).replace(/\D/g, '').replace(/^0+/, '').padStart(9, '0')
  if (!/^\d{9}$/.test(cleanAfm)) {
    return NextResponse.json({ error: 'Invalid AFM' }, { status: 400 })
  }

  const expiresAt = expiresInDays
    ? new Date(Date.now() + Number(expiresInDays) * 24 * 60 * 60 * 1000)
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // default 30 days

  const session = await prisma.widgetSession.create({
    data: {
      afm: cleanAfm,
      clientName: clientName || null,
      email: email || null,
      phone: phone || null,
      leadRef: leadRef || null,
      expiresAt,
    },
  })

  const appUrl = process.env.APP_URL || 'https://logistis.i-mentor.gr'
  const url = `${appUrl}/check/${session.token}`

  return NextResponse.json({ token: session.token, url, expiresAt }, { status: 201 })
}
