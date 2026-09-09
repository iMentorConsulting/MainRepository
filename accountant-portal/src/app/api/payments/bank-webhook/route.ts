import { NextRequest, NextResponse } from 'next/server'

// Placeholder for future bank webhook integration
// When your bank provides webhook/notification API, implement here
// For now, use manual confirmation via /api/payments/requests/[id]/confirm

export async function POST(req: NextRequest) {
  // TODO: Implement when bank provides webhook API
  // Verify request signature from bank
  // Parse payment notification
  // Find matching paymentRequest by irisReference
  // Update status to PAID
  return NextResponse.json({ message: 'Bank webhook endpoint - not yet configured' }, { status: 200 })
}
