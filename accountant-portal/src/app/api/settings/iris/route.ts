import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

// Store in environment or a simple settings table
// For now use env vars with ability to override

export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return NextResponse.json({
    iban: process.env.IRIS_IBAN || '',
    merchantName: process.env.IRIS_MERCHANT_NAME || 'I-MENTOR',
    referencePrefix: process.env.IRIS_REFERENCE_PREFIX || 'IMENT',
  })
}
