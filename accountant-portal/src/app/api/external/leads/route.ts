import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import { sendViberMessage } from '@/lib/viber'
import { getOrCreateErmisLink } from '@/lib/ermis'

// Inbound webhook for the public "θέλω να ξεκινήσω επιχείρηση" lead-capture
// form (Bitform), for people interested in starting a new business who have
// no AFM/company yet — unlike /api/external/vat-update, which is for people
// who DO have an AFM. We create a placeholder Business (synthetic AFM, no
// accountant), match it to whichever Program is flagged `leadIntake`, and
// send the lead a link to talk to Ερμής about it directly.
// Auth: header `x-api-key` (or `key`/`KEY` query/body param, same as
// vat-update) must match env LEADS_API_KEY.

function checkApiKey(request: NextRequest, body: any): boolean {
  const key = process.env.LEADS_API_KEY
  if (!key) return false
  const headerKey = request.headers.get('x-api-key')
  const queryKey = request.nextUrl.searchParams.get('key') || request.nextUrl.searchParams.get('KEY')
  const bodyKey = body?.key || body?.KEY
  return headerKey === key || queryKey === key || bodyKey === key
}

function pick(searchParams: URLSearchParams, body: any, ...names: string[]): string {
  for (const name of names) {
    const fromQuery = searchParams.get(name)
    if (fromQuery) return fromQuery
    const fromBody = body?.[name]
    if (fromBody) return String(fromBody)
  }
  return ''
}

async function parseBody(request: NextRequest): Promise<Record<string, any>> {
  const text = await request.text().catch(() => '')
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    const params = new URLSearchParams(text)
    const obj: Record<string, any> = {}
    params.forEach((v, k) => { obj[k] = v })
    return obj
  }
}

function normalizePhone(value: string | null): string | null {
  if (!value) return null
  let digits = value.replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('0030')) digits = digits.slice(4)
  else if (digits.startsWith('30') && digits.length > 10) digits = digits.slice(2)
  return digits || null
}

async function generateLeadAfm(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `LEAD-${crypto.randomBytes(6).toString('hex')}`
    const existing = await prisma.business.findUnique({ where: { afm: candidate }, select: { id: true } })
    if (!existing) return candidate
  }
  throw new Error('Could not generate a unique placeholder AFM for lead')
}

export async function POST(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const body = await parseBody(request)

  if (!checkApiKey(request, body)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const name = pick(searchParams, body, 'NAME', 'name', 'ΟΝΟΜΑ', 'ονοματεπώνυμο', 'fullname').trim() || null
  const email = pick(searchParams, body, 'EMAIL', 'email').trim() || null
  const phone = normalizePhone(pick(searchParams, body, 'PHONE', 'phone', 'ΤΗΛΕΦΩΝΟ', 'τηλέφωνο', 'viber', 'VIBER') || null)
  const sector = pick(searchParams, body, 'SECTOR', 'sector', 'ΚΛΑΔΟΣ', 'κλάδος', 'category', 'ΚΑΤΗΓΟΡΙΑ').trim() || null
  const referer = pick(searchParams, body, 'REFERER', 'referer').trim() || null

  if (!email && !phone) {
    return NextResponse.json({ error: 'Απαιτείται email ή τηλέφωνο' }, { status: 400 })
  }

  // Avoid creating duplicate lead rows for the same person resubmitting the form.
  const existingLead = email
    ? await prisma.business.findFirst({ where: { source: 'lead-form', email }, select: { id: true } })
    : null

  const business = existingLead
    ? await prisma.business.update({
        where: { id: existingLead.id },
        data: { ...(phone ? { viberPhone: phone } : {}) },
      })
    : await prisma.business.create({
        data: {
          afm: await generateLeadAfm(),
          clientType: 'INDIVIDUAL',
          source: 'lead-form',
          onomasia: name,
          email,
          viberPhone: phone,
          tags: ['Νέα Επιχείρηση', ...(sector ? [sector] : [])],
          notes: [
            'Lead από φόρμα ιστοσελίδας (χωρίς ΑΦΜ — ενδιαφέρεται να ξεκινήσει επιχείρηση).',
            sector ? `Κλάδος ενδιαφέροντος: ${sector}` : null,
            referer ? `Referer: ${referer}` : null,
          ].filter(Boolean).join('\n'),
        },
      })

  const leadProgram = await prisma.program.findFirst({
    where: { leadIntake: true, active: true },
    orderBy: { createdAt: 'desc' },
  })

  if (!leadProgram) {
    console.error('[Leads webhook] No active Program flagged leadIntake — lead saved without an Ερμής link.')
    return NextResponse.json({ success: true, businessId: business.id, ermisLinkSent: false })
  }

  await prisma.programMatch.upsert({
    where: { programId_businessId: { programId: leadProgram.id, businessId: business.id } },
    create: {
      programId: leadProgram.id,
      businessId: business.id,
      status: 'INTERESTED',
      matchReason: ['Ενδιαφέρον από φόρμα ιστοσελίδας για νέα επιχείρηση'],
    },
    update: {},
  })

  const ermisLink = await getOrCreateErmisLink(business.id, leadProgram.id)

  let sent = false
  if (email) {
    sendEmail({
      to: email,
      subject: `Η I-MENTOR θα σας βοηθήσει να ξεκινήσετε — ${leadProgram.title}`,
      html: `<p>Γεια σας${name ? ` ${name}` : ''},</p>
        <p>Ευχαριστούμε για το ενδιαφέρον σας να ξεκινήσετε νέα επιχείρηση. Μιλήστε τώρα με τον ψηφιακό μας σύμβουλο, τον Ερμή, για να δείτε αμέσως τις επιλογές χρηματοδότησης:</p>
        <p><a href="${ermisLink}">${ermisLink}</a></p>`,
    }).then(ok => { if (ok) sent = true }).catch(() => {})
  }
  if (phone) {
    sendViberMessage({
      to: phone,
      text: `Γεια σας${name ? ` ${name}` : ''}! Ευχαριστούμε για το ενδιαφέρον σας να ξεκινήσετε νέα επιχείρηση. Μιλήστε τώρα με τον Ερμή για τις επιλογές χρηματοδότησης: ${ermisLink}`,
    }).then(r => { if (r.ok) sent = true }).catch(() => {})
  }

  sendEmail({
    to: process.env.ADMIN_EMAIL || 'info@i-mentor.gr',
    subject: `🆕 Νέο lead (χωρίς ΑΦΜ): ${name || email || phone}`,
    html: `<p>Νέο ενδιαφέρον για νέα επιχείρηση από τη φόρμα ιστοσελίδας${sector ? ` (κλάδος: ${sector})` : ''}.</p>
      <p><a href="${process.env.APP_URL || 'https://logistis.i-mentor.gr'}/businesses/${business.id}">Δείτε την επιχείρηση →</a></p>`,
  }).catch(() => {})

  return NextResponse.json({ success: true, businessId: business.id, ermisLinkSent: sent, ermisLink })
}
