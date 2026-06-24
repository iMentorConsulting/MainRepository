import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import { sendViberMessage } from '@/lib/viber'
import { getOrCreateErmisLink } from '@/lib/ermis'
import { lookupAfm } from '@/lib/gsis'

// Inbound webhook for the public lead-capture forms (Bitform), for people
// interested in a specific Program who may or may not have an AFM/company
// yet. Each Bitform form targets one Program — the form must send a field
// with the program's exact title (PROGRAM/program/ΠΡΟΓΡΑΜΜΑ) so we can look
// it up; if that's missing/unmatched we fall back to whichever Program is
// flagged `leadIntake`. If the form also sends a VAT field, we run the same
// AFM lookup/creation flow as /api/external/vat-update instead of creating a
// placeholder lead — unlike vat-update, we still target the named Program
// specifically (manual ProgramMatch + Ερμής link) rather than running the
// full automated matching engine.
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

// Natural persons (sole proprietors) come back from GSIS as
// "ΕΠΩΝΥΜΟ ΟΝΟΜΑ ΠΑΤΡΩΝΥΜΟ" with no legal status — trim the patronymic
// and label them as ΑΤΟΜΙΚΗ. Mirrors vat-update/route.ts.
function applySoleProprietorFix(gsisData: any): { onomasia: string | null; legalStatusDescr: string | null } {
  let onomasia = gsisData?.onomasia || ''
  let legalStatusDescr = gsisData?.legalStatusDescr || ''

  if (!legalStatusDescr) {
    const parts = onomasia.trim().split(/\s+/)
    if (parts.length >= 3) {
      onomasia = parts.slice(0, 2).join(' ')
    }
    legalStatusDescr = 'ΑΤΟΜΙΚΗ'
  }

  return { onomasia: onomasia || null, legalStatusDescr: legalStatusDescr || null }
}

async function generateLeadAfm(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `LEAD-${crypto.randomBytes(6).toString('hex')}`
    const existing = await prisma.business.findUnique({ where: { afm: candidate }, select: { id: true } })
    if (!existing) return candidate
  }
  throw new Error('Could not generate a unique placeholder AFM for lead')
}

async function resolveProgram(programName: string | null) {
  if (programName) {
    const byName = await prisma.program.findFirst({
      where: { title: { equals: programName, mode: 'insensitive' }, active: true },
    })
    if (byName) return byName
  }
  return prisma.program.findFirst({
    where: { leadIntake: true, active: true },
    orderBy: { createdAt: 'desc' },
  })
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
  const programName = pick(searchParams, body, 'PROGRAM', 'program', 'ΠΡΟΓΡΑΜΜΑ', 'πρόγραμμα').trim() || null
  const afm = pick(searchParams, body, 'VAT', 'vat', 'afm', 'ΑΦΜ').replace(/\D/g, '') || null

  if (!email && !phone) {
    return NextResponse.json({ error: 'Απαιτείται email ή τηλέφωνο' }, { status: 400 })
  }

  const program = await resolveProgram(programName)
  if (!program) {
    console.error('[Leads webhook] No matching Program found (and none flagged leadIntake) — lead not saved.')
    return NextResponse.json({ error: 'Δεν βρέθηκε αντίστοιχο πρόγραμμα' }, { status: 404 })
  }

  let business
  let created = false

  if (afm && afm.length === 9) {
    const existingByAfm = await prisma.business.findUnique({ where: { afm }, select: { id: true } })
    if (existingByAfm) {
      business = await prisma.business.update({
        where: { afm },
        data: {
          ...(email ? { email } : {}),
          ...(phone ? { viberPhone: phone } : {}),
        },
      })
    } else {
      let gsisData: any = null
      try {
        gsisData = await lookupAfm(afm)
      } catch {
        gsisData = null
      }

      const soleProprietorFix = gsisData ? applySoleProprietorFix(gsisData) : null

      business = await prisma.business.create({
        data: {
          afm,
          email,
          viberPhone: phone,
          source: 'lead-form',
          tags: ['Νέο Lead από Φόρμα', ...(sector ? [sector] : [])],
          legalStatusDescr: soleProprietorFix?.legalStatusDescr || (gsisData ? null : 'ΙΔΙΩΤΗΣ'),
          onomasia: soleProprietorFix?.onomasia || gsisData?.onomasia || name,
          commercialTitle: gsisData?.commercialTitle || null,
          regdate: gsisData?.regdate || null,
          postalAddress: gsisData?.postalAddress || null,
          postalAddressNo: gsisData?.postalAddressNo || null,
          postalZipCode: gsisData?.postalZipCode || null,
          postalAreaDescription: gsisData?.postalAreaDescription || null,
          doy: gsisData?.doy || null,
          doyDescr: gsisData?.doyDescr || null,
          notes: [
            `Lead από φόρμα ιστοσελίδας (πρόγραμμα: ${program.title}).`,
            sector ? `Κλάδος ενδιαφέροντος: ${sector}` : null,
            referer ? `Referer: ${referer}` : null,
          ].filter(Boolean).join('\n'),
          activities: gsisData?.activities?.length ? {
            create: gsisData.activities.map((a: any) => ({
              firmActCode: a.firmActCode,
              firmActDescr: a.firmActDescr,
              firmActKind: a.firmActKind ? parseInt(String(a.firmActKind)) : null,
              firmActKindDescr: a.firmActKindDescr,
            }))
          } : undefined,
        },
      })
      created = true
    }
  } else {
    // No VAT — synthetic placeholder lead, no real business yet.
    const existingLead = email
      ? await prisma.business.findFirst({ where: { source: 'lead-form', email }, select: { id: true } })
      : null

    business = existingLead
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
              `Lead από φόρμα ιστοσελίδας (χωρίς ΑΦΜ — πρόγραμμα: ${program.title}).`,
              sector ? `Κλάδος ενδιαφέροντος: ${sector}` : null,
              referer ? `Referer: ${referer}` : null,
            ].filter(Boolean).join('\n'),
          },
        })
    created = !existingLead
  }

  await prisma.programMatch.upsert({
    where: { programId_businessId: { programId: program.id, businessId: business.id } },
    create: {
      programId: program.id,
      businessId: business.id,
      status: 'INTERESTED',
      matchReason: ['Ενδιαφέρον από φόρμα ιστοσελίδας'],
    },
    update: {},
  })

  const ermisLink = await getOrCreateErmisLink(business.id, program.id)

  let sent = false
  if (email) {
    sendEmail({
      to: email,
      subject: `Η I-MENTOR θα σας βοηθήσει — ${program.title}`,
      html: `<p>Γεια σας${name ? ` ${name}` : ''},</p>
        <p>Ευχαριστούμε για το ενδιαφέρον σας. Μιλήστε τώρα με τον ψηφιακό μας σύμβουλο, τον Ερμή, για να δείτε αμέσως τις επιλογές χρηματοδότησης:</p>
        <p><a href="${ermisLink}">${ermisLink}</a></p>`,
    }).then(ok => { if (ok) sent = true }).catch(() => {})
  }
  if (phone) {
    sendViberMessage({
      to: phone,
      text: `Γεια σας${name ? ` ${name}` : ''}! Ευχαριστούμε για το ενδιαφέρον σας. Μιλήστε τώρα με τον Ερμή για τις επιλογές χρηματοδότησης: ${ermisLink}`,
    }).then(r => { if (r.ok) sent = true }).catch(() => {})
  }

  sendEmail({
    to: process.env.ADMIN_EMAIL || 'info@i-mentor.gr',
    subject: `🆕 Νέο lead: ${name || email || phone} (${program.title})`,
    html: `<p>Νέο ενδιαφέρον από τη φόρμα ιστοσελίδας για το πρόγραμμα <strong>${program.title}</strong>${sector ? ` (κλάδος: ${sector})` : ''}.</p>
      <p><a href="${process.env.APP_URL || 'https://logistis.i-mentor.gr'}/businesses/${business.id}">Δείτε την επιχείρηση →</a></p>`,
  }).catch(() => {})

  return NextResponse.json({ success: true, businessId: business.id, created, programId: program.id, ermisLinkSent: sent, ermisLink })
}
