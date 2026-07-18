import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

const API_KEY = process.env.MOOSEND_API_KEY ?? ''
const SENDER_EMAIL = process.env.MOOSEND_SENDER_EMAIL ?? 'info@i-mentor.gr'
const BASE_URL = 'https://api.moosend.com/v3'

async function mp(path: string, body?: unknown) {
  const res = await fetch(`${BASE_URL}${path}?apikey=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || (data.Code !== undefined && data.Code !== 0)) {
    throw new Error(`Moosend ${path}: ${data.Error ?? data.Message ?? JSON.stringify(data)}`)
  }
  return data
}

export async function POST(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`
  if (!isCron) {
    const session = await auth()
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const TEST_EMAIL = 'Haris.Apostolakis@gmail.com'
  const log: string[] = []

  try {
    // 1. Create list
    const listData = await mp('/lists/create.json', { Name: `MergeTagTest-${Date.now()}` })
    const listId = typeof listData.Context === 'string' ? listData.Context : listData.Context?.ID
    log.push(`✓ List created: ${listId}`)

    // 2. Create one custom field on the list
    const fieldData = await mp(`/lists/${listId}/customfields/create.json`, {
      Name: 'business_name',
      CustomFieldType: 'Text',
      IsRequired: false,
    })
    log.push(`✓ Custom field created: ${JSON.stringify(fieldData.Context)}`)

    // 3. Subscribe test recipient with custom field value
    const subData = await mp(`/subscribers/${listId}/subscribe_many.json`, {
      Subscribers: [{
        Email: TEST_EMAIL,
        Name: 'Χάρης Αποστολάκης',
        CustomFields: ['business_name=ΔΟΚΙΜΑΣΤΙΚΗ ΕΠΕ'],
      }],
    })
    log.push(`✓ Subscriber added: ${JSON.stringify(subData.Context)}`)

    // 4. Create campaign — test three merge tag formats
    const html = `
<h2>Moosend Merge Tag Test</h2>
<p>Format 1 — [business_name]: <strong>[business_name]</strong></p>
<p>Format 2 — [Name]: <strong>[Name]</strong></p>
<p>Format 3 — [Email]: <strong>[Email]</strong></p>
<p>If any of the above shows the actual value (not the literal tag), that format works.</p>
`
    const campData = await mp('/campaigns/create.json', {
      Name: `MergeTagTest-${Date.now()}`,
      Subject: 'Merge Tag Test — business_name=[business_name]',
      SenderEmail: SENDER_EMAIL,
      ReplyToEmail: SENDER_EMAIL,
      MailingLists: [{ MailingListID: listId, SegmentID: null }],
      HTMLContent: html,
      Type: 'Regular',
    })
    const campaignId = typeof campData.Context === 'string' ? campData.Context : campData.Context?.ID
    log.push(`✓ Campaign created: ${campaignId}`)

    // 5. Send
    await mp(`/campaigns/${campaignId}/send.json`, {
      ScheduledDateTime: new Date().toISOString(),
      TimezoneID: 53,
    })
    log.push(`✓ Campaign sent to ${TEST_EMAIL}`)

    return NextResponse.json({ ok: true, log })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, log, error: message }, { status: 500 })
  }
}
