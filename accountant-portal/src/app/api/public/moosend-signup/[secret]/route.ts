import { NextRequest, NextResponse } from 'next/server'
import { checkEligibilityForAfm } from '@/lib/eligibility-check-core'
import { buildEligibilitySubject, buildEligibilityEmailHtml } from '@/lib/eligibility-email'
import { sendEmail } from '@/lib/email'

// POST /api/public/moosend-signup/{secret}
// Target for a Moosend "Publish a webhook" automation action, triggered when
// someone submits the newsletter signup form (email + ΑΦΜ). Moosend's
// webhook action only offers a plain URL field — no custom headers — so the
// secret has to live in the path itself rather than an x-api-key header.
// Configure MOOSEND_WEBHOOK_SECRET on Railway, then set the Moosend webhook
// URL to https://logistis.i-mentor.gr/api/public/moosend-signup/<that secret>.
//
// On receipt: looks up the ΑΦΜ (AADE if new), runs multi-program matching
// (same engine as the on-page widget), and — only if at least one program
// matches — emails the subscriber every eligible program with its own
// "chat with Ermis" link. Silent no-op if nothing matches; this isn't a form
// with a live page to show a "sorry" result on.

// Moosend's exact webhook payload shape isn't confirmed from here (no way to
// test live from this environment) — this checks every plausible field name
// and shape. If a real payload doesn't parse, the raw body is logged so the
// keys can be added.
function extractField(body: any, candidateKeys: string[]): string | null {
  if (!body || typeof body !== 'object') return null

  for (const key of candidateKeys) {
    const direct = body[key]
    if (direct !== undefined && direct !== null && String(direct).trim()) return String(direct).trim()
  }

  // Moosend "CustomFields": [{ Name, Value }]
  const customFieldsArrays = [body.CustomFields, body.customFields, body.Subscriber?.CustomFields]
  for (const arr of customFieldsArrays) {
    if (!Array.isArray(arr)) continue
    for (const field of arr) {
      const fieldName = String(field?.Name ?? field?.name ?? '').toLowerCase()
      if (candidateKeys.some(k => k.toLowerCase() === fieldName) && field?.Value) {
        return String(field.Value).trim()
      }
    }
  }

  // Moosend "MergeFields": { Key: Value }
  const mergeFieldsObjects = [body.MergeFields, body.mergeFields]
  for (const obj of mergeFieldsObjects) {
    if (!obj || typeof obj !== 'object') continue
    for (const key of candidateKeys) {
      if (obj[key] !== undefined && obj[key] !== null && String(obj[key]).trim()) return String(obj[key]).trim()
    }
  }

  // Nested under a "Subscriber" object
  if (body.Subscriber && typeof body.Subscriber === 'object') {
    return extractField(body.Subscriber, candidateKeys)
  }

  return null
}

// Moosend validates the webhook URL when you save the automation step —
// exactly how isn't documented from here, but it's some kind of reachability
// check (GET/HEAD/OPTIONS, or a POST with an empty/test body) done before it
// lets you save. Answer all of those with 200 so validation passes; the only
// non-200 this route ever returns is 401 for a wrong secret. Every "couldn't
// process this particular payload" case still gets logged and returns 200
// with ok:false in the body instead of an HTTP error status, so a real
// delivery Moosend can't parse doesn't look like a broken endpoint either.

function checkSecret(secret: string): boolean {
  const configuredSecret = process.env.MOOSEND_WEBHOOK_SECRET
  return !!configuredSecret && secret === configuredSecret
}

export async function GET(request: NextRequest, { params }: { params: { secret: string } }) {
  if (!checkSecret(params.secret)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ ok: true })
}

export async function OPTIONS(request: NextRequest, { params }: { params: { secret: string } }) {
  if (!checkSecret(params.secret)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ ok: true })
}

export async function HEAD(request: NextRequest, { params }: { params: { secret: string } }) {
  if (!checkSecret(params.secret)) return new NextResponse(null, { status: 401 })
  return new NextResponse(null, { status: 200 })
}

export async function POST(request: NextRequest, { params }: { params: { secret: string } }) {
  if (!checkSecret(params.secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: any = null
  try {
    const text = await request.text()
    body = text ? JSON.parse(text) : null
  } catch {
    console.error('[MoosendSignup] non-JSON or empty body (likely a Moosend validation ping)')
    return NextResponse.json({ ok: false, reason: 'invalid or empty JSON body' })
  }

  const email = extractField(body, ['Email', 'email', 'EMAIL'])
  const rawAfm = extractField(body, ['AFM', 'afm', 'ΑΦΜ', 'Afm', 'VAT', 'TaxId'])

  if (!rawAfm) {
    console.error('[MoosendSignup] no ΑΦΜ field found in webhook payload:', JSON.stringify(body).slice(0, 1000))
    return NextResponse.json({ ok: false, reason: 'no ΑΦΜ field found', received: body })
  }

  const cleanAfm = rawAfm.replace(/\D/g, '').padStart(9, '0')
  if (!/^\d{9}$/.test(cleanAfm)) {
    return NextResponse.json({ ok: false, reason: 'invalid ΑΦΜ' })
  }

  try {
    const result = await checkEligibilityForAfm(cleanAfm, email, null)

    if (result.programs.length === 0) {
      console.log(`[MoosendSignup] ΑΦΜ ${cleanAfm}: no eligible programs — no email sent`)
      return NextResponse.json({ ok: true, eligible: false })
    }

    if (!email) {
      console.error(`[MoosendSignup] ΑΦΜ ${cleanAfm} matched ${result.programs.length} programs but no email address was provided — cannot notify`)
      return NextResponse.json({ ok: true, eligible: true, emailSent: false, reason: 'no email in payload' })
    }

    await sendEmail({
      to: email,
      subject: buildEligibilitySubject(result.businessName, result.programs.length),
      html: buildEligibilityEmailHtml({ businessName: result.businessName, programs: result.programs }),
    })

    return NextResponse.json({ ok: true, eligible: true, emailSent: true, programCount: result.programs.length })
  } catch (err: any) {
    console.error('[MoosendSignup] processing failed:', err?.message)
    return NextResponse.json({ ok: false, reason: 'processing failed' })
  }
}
