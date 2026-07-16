import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sendViberMessage } from '@/lib/chatwoot'
import { GEMI_DISCLAIMER } from '@/lib/moosend'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { testPhone, message } = await request.json()
  if (!testPhone?.trim()) return NextResponse.json({ error: 'testPhone required' }, { status: 400 })
  if (!message?.trim()) return NextResponse.json({ error: 'message required' }, { status: 400 })

  const fullMessage = message.trim() + '\n\n' + GEMI_DISCLAIMER

  try {
    const { conversationId } = await sendViberMessage(testPhone.trim(), fullMessage, 'Test')
    return NextResponse.json({ ok: true, conversationId, sentTo: testPhone.trim() })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[ViberTest]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
