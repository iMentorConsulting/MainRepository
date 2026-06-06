import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { testSmtpConnection } from '@/lib/email'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const ok = await testSmtpConnection()
  if (ok) {
    return NextResponse.json({ success: true })
  } else {
    return NextResponse.json({ error: 'SMTP connection failed' }, { status: 500 })
  }
}
