import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { GEMI_DISCLAIMER } from '@/lib/moosend'

const SENDER_EMAIL = process.env.MOOSEND_SENDER_EMAIL ?? 'noreply@i-mentor.gr'
const REPLY_TO_EMAIL = process.env.MOOSEND_REPLY_TO_EMAIL ?? 'noreply@i-mentor.gr'
const MOOSEND_API_KEY = process.env.MOOSEND_API_KEY ?? ''
const BASE_URL = 'https://api.moosend.com/v3'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!MOOSEND_API_KEY) {
    return NextResponse.json({ error: 'MOOSEND_API_KEY environment variable is not configured in Railway' }, { status: 500 })
  }

  const { id } = await params
  const body = await req.json()
  const { testEmail, subject, htmlContent } = body

  if (!testEmail) return NextResponse.json({ error: 'testEmail required' }, { status: 400 })
  if (!htmlContent) return NextResponse.json({ error: 'htmlContent required' }, { status: 400 })

  const htmlWithDisclaimer =
    htmlContent +
    `\n<p style="font-size:11px;color:#888;margin-top:24px;border-top:1px solid #eee;padding-top:12px;">${GEMI_DISCLAIMER}</p>` +
    `\n<p style="font-size:10px;color:#aaa;">⚠️ ΔΟΚΙΜΑΣΤΙΚΟ EMAIL — campaign id: ${id}</p>`

  // Create a temporary single-subscriber Moosend list and send campaign
  const listName = `TEST-${id}-${Date.now()}`

  const listRes = await fetch(`${BASE_URL}/lists/create.json?apikey=${MOOSEND_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ Name: listName }),
  })
  const listData = await listRes.json().catch(() => ({}))
  console.log('[GemiTestSend] Moosend list create response:', JSON.stringify(listData))
  if (!listRes.ok || listData.Code !== 0) {
    return NextResponse.json({
      error: listData.Error ?? listData.Message ?? 'Failed to create Moosend test list',
      detail: listData,
    }, { status: 500 })
  }
  // Context may be the ID string directly, or an object with .ID
  const listId: string | undefined =
    typeof listData.Context === 'string' ? listData.Context : listData.Context?.ID
  if (!listId) {
    return NextResponse.json({ error: 'No list ID returned from Moosend', detail: listData }, { status: 500 })
  }

  // Add test subscriber
  await fetch(`${BASE_URL}/subscribers/${listId}/subscribe.json?apikey=${MOOSEND_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ Email: testEmail, Name: 'Test Recipient' }),
  })

  // Create and send campaign
  const campaignRes = await fetch(`${BASE_URL}/campaigns/create.json?apikey=${MOOSEND_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      Name: `[TEST] ${subject || 'ΓΕΜΗ Test'}`,
      Subject: `[TEST] ${subject || 'ΓΕΜΗ Test'}`,
      SenderEmail: SENDER_EMAIL,
      ReplyToEmail: REPLY_TO_EMAIL,
      MailingLists: [{ MailingListID: listId, SegmentID: null }],
      HTMLContent: htmlWithDisclaimer,
      Type: 'Regular',
    }),
  })
  const campaignData = await campaignRes.json().catch(() => ({}))
  console.log('[GemiTestSend] Moosend campaign create response:', JSON.stringify(campaignData))
  if (!campaignRes.ok || campaignData.Code !== 0) {
    return NextResponse.json({
      error: `Moosend campaign error: ${campaignData.Error ?? campaignData.Message ?? JSON.stringify(campaignData)}`,
      detail: campaignData,
    }, { status: 500 })
  }
  const moosendCampaignId: string | undefined = campaignData.Context?.ID
  if (!moosendCampaignId) {
    return NextResponse.json({ error: 'No campaign ID returned from Moosend', detail: campaignData }, { status: 500 })
  }

  // Send immediately
  const sendRes = await fetch(`${BASE_URL}/campaigns/${moosendCampaignId}/send.json?apikey=${MOOSEND_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ScheduledDateTime: new Date().toISOString(), TimezoneID: 53 }),
  })

  if (!sendRes.ok) {
    return NextResponse.json({ error: 'Failed to send test campaign' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, sentTo: testEmail })
}
