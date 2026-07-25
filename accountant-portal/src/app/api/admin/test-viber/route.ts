import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sendViberMessage } from '@/lib/viber'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const to: string = typeof body.to === 'string' && body.to.trim() ? body.to.trim() : '6973315365'
  const text: string = typeof body.text === 'string' && body.text.trim()
    ? body.text.trim()
    : `[TEST] Logistis Viber test — ${new Date().toLocaleString('el-GR')}`

  const result = await sendViberMessage({ to, text, senderName: 'I-MENTOR Portal' })
  return NextResponse.json({ to, text, ...result })
}
