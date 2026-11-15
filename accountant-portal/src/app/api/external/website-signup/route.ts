import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import { sendViberMessage } from '@/lib/viber'
import { getOrCreateErmisLink } from '@/lib/ermis'
import { lookupAfm } from '@/lib/gsis'
import { runMatchingForBusiness } from '@/lib/matching'
import { notifyCaseManagement } from '@/lib/case-management-sync'
import { buildBusinessProfilePayload, BUSINESS_PROFILE_SELECT } from '@/lib/business-profile'

// Inbound webhook for the UNIVERSAL signup form (Bitform) that sits under every
// auto-created program page on i-mentor.gr. The form is the same on every page;
// the page the client was on identifies the program:
//   POST_ID    = ${_bf_post_id}        → Program.wpPageId   (exact, survives renames)
//   POST_TITLE = ${_bf_post_title}     → Program.title      (fallback)
//   referrer   = ${_bf_http_referer_url} → Program.wpPageUrl / websiteUrl (fallback)
// If the program cannot be identified UNAMBIGUOUSLY we save the business but do
// NOT message the client or open a case — an admin is alerted instead.
//
// Per submission: upsert Business (source "website-form") → run the matching
// engine → ensure an INTERESTED match for THIS program → (unless a case for this
// business+program is already open) email + Viber with the Ερμής link for that
// exact program, open a ClientCase and push it to Case Management.
// Auth: header `x-api-key` (or ?key=) must match env LEADS_API_KEY.

function checkApiKey(request: NextRequest, body: any): boolean {
  const key = process.env.LEADS_API_KEY
  if (!key) return false
  const headerKey = request.headers.get('x-api-key')
  const queryKey = request.nextUrl.searchParams.get('key') || request.nextUrl.searchParams.get('KEY')
  const bodyKey = body?.key || body?.KEY
  return headerKey === key || queryKey === key || bodyKey === key
}

// Bitform leaves a smart tag unresolved as the literal "${...}" when empty.
function clean(v: unknown): string {
  const s = String(v ?? '').trim()
  return s.startsWith('${') ? '' : s
}

function pick(searchParams: URLSearchParams, body: any, ...names: string[]): string {
  for (const name of names) {
    const q = clean(searchParams.get(name))
    if (q) return q
    const b = clean(body?.[name])
    if (b) return b
  }
  return ''
}

async function parseBody(request: NextRequest): Promise<Record<string, any>> {
  const text = await request.text().catch(() => '')
  if (!text) return {}
  try { return JSON.parse(text) } catch {
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

function applySoleProprietorFix(gsisData: any): { onomasia: string | null; legalStatusDescr: string | null } {
  let onomasia = gsisData?.onomasia || ''
  let legalStatusDescr = gsisData?.legalStatusDescr || ''
  if (!legalStatusDescr) {
    const parts = onomasia.trim().split(/\s+/)
    if (parts.length >= 3) onomasia = parts.slice(0, 2).join(' ')
    legalStatusDescr = 'ΑΤΟΜΙΚΗ'
  }
  return { onomasia: onomasia || null, legalStatusDescr: legalStatusDescr || null }
}

function esc(v: unknown): string {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function normUrl(u: string | null | undefined): string {
  if (!u) return ''
  try {
    const url = new URL(u)
    return `${url.hostname.replace(/^www\./, '').toLowerCase()}${url.pathname.replace(/\/+$/, '')}`
  } catch { return '' }
}

type Resolved =
  | { program: NonNullable<Awaited<ReturnType<typeof prisma.program.findFirst>>>; method: 'post_id' | 'title' | 'url' }
  | { program: null; reason: string }

// Layered, never guesses: an ambiguous layer (several programs) does not match.
async function resolveProgram(postId: string, postTitle: string, referrer: string): Promise<Resolved> {
  if (/^\d+$/.test(postId)) {
    const byId = await prisma.program.findMany({ where: { wpPageId: Number(postId) } })
    if (byId.length === 1) return { program: byId[0], method: 'post_id' }
  }
  if (postTitle) {
    const byTitle = await prisma.program.findMany({ where: { title: { equals: postTitle, mode: 'insensitive' } } })
    if (byTitle.length === 1) return { program: byTitle[0], method: 'title' }
  }
  const ref = normUrl(referrer)
  if (ref) {
    const withUrls = await prisma.program.findMany({ where: { OR: [{ websiteUrl: { not: null } }, { wpPageUrl: { not: null } }] } })
    const byUrl = withUrls.filter(p => normUrl(p.wpPageUrl) === ref || normUrl(p.websiteUrl) === ref)
    if (byUrl.length === 1) return { program: byUrl[0], method: 'url' }
  }
  return { program: null, reason: `post_id="${postId}" title="${postTitle}" referrer="${referrer}"` }
}

// Single-process guard against the same submission arriving twice at once.
const inFlight = new Set<string>()

export async function POST(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const body = await parseBody(request)
  if (!checkApiKey(request, body)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const name = pick(searchParams, body, 'epwnymia', 'EPWNYMIA', 'name', 'NAME')
  const email = pick(searchParams, body, 'email', 'EMAIL') || null
  const afm = pick(searchParams, body, 'VAT', 'vat', 'afm').replace(/\D/g, '').replace(/^0+(?=\d{9}$)/, '')
  const phone = normalizePhone(pick(searchParams, body, 'TEL', 'tel', 'phone', 'PHONE') || null)
  const activity = pick(searchParams, body, 'bus_activity')
  const qActive = pick(searchParams, body, 'Q_acvtive_bus', 'Q_active_bus')
  const qPersonnel = pick(searchParams, body, 'Q_personel', 'Q_personnel')
  const qInvestment = pick(searchParams, body, 'Q_investment')
  const qStart = pick(searchParams, body, 'Q_start', 'Q_start_date')
  const comment = pick(searchParams, body, 'Comment', 'comment')
  const referrer = pick(searchParams, body, 'referrer', 'referer')
  const postId = pick(searchParams, body, 'POST_ID', 'post_id')
  const postTitle = pick(searchParams, body, 'POST_TITLE', 'post_title')

  if (afm.length !== 9) return NextResponse.json({ error: 'Μη έγκυρο ΑΦΜ' }, { status: 400 })
  if (!email && !phone) return NextResponse.json({ error: 'Απαιτείται email ή τηλέφωνο' }, { status: 400 })

  const resolved = await resolveProgram(postId, postTitle, referrer)
  const program = resolved.program
  const matchedBy = program ? (resolved as any).method : null

  const lockKey = `${afm}:${program?.id ?? 'none'}`
  if (inFlight.has(lockKey)) return NextResponse.json({ success: true, duplicate: true })
  inFlight.add(lockKey)
  try {
    // ── Business ──────────────────────────────────────────────────────────────
    const answers = [
      activity ? `Αντικείμενο δραστηριότητας: ${activity}` : null,
      qActive ? `Ενεργή επιχείρηση: ${qActive}` : null,
      qStart ? `Έναρξη επιχείρησης (δήλωση πελάτη): ${qStart}` : null,
      qPersonnel ? `Απασχολεί προσωπικό: ${qPersonnel}` : null,
      qInvestment ? `Επένδυση: ${qInvestment}` : null,
      comment ? `Σχόλιο: ${comment}` : null,
    ].filter(Boolean) as string[]
    const noteHeader = program
      ? `Αίτημα μέσω φόρμας ιστοσελίδας για «${program.title}» (αναγνώριση προγράμματος: ${matchedBy}).`
      : `Αίτημα μέσω φόρμας ιστοσελίδας — ΑΓΝΩΣΤΟ ΠΡΟΓΡΑΜΜΑ (${(resolved as any).reason}).`
    const noteText = [noteHeader, ...answers, referrer ? `Referer: ${referrer}` : null].filter(Boolean).join('\n')

    const existing = await prisma.business.findUnique({ where: { afm }, select: { id: true, phone: true, tags: true, notes: true } })
    let created = false
    let businessId: string
    if (existing) {
      businessId = existing.id
      await prisma.business.update({
        where: { id: existing.id },
        data: {
          ...(email ? { email } : {}),
          ...(phone ? { viberPhone: phone, ...(existing.phone ? {} : { phone }) } : {}),
          tags: existing.tags.includes('Αίτημα από Website') ? existing.tags : [...existing.tags, 'Αίτημα από Website'],
          notes: [existing.notes, `— ${new Date().toISOString().slice(0, 10)} —`, noteText].filter(Boolean).join('\n'),
        },
      })
    } else {
      let gsisData: any = null
      try { gsisData = await lookupAfm(afm) } catch { gsisData = null }
      const fix = gsisData ? applySoleProprietorFix(gsisData) : null
      const b = await prisma.business.create({
        data: {
          afm,
          email,
          viberPhone: phone,
          phone,
          source: 'website-form',
          tags: ['Εγγραφή από Website', 'Αίτημα από Website', ...(program ? [] : ['Άγνωστο πρόγραμμα φόρμας'])],
          legalStatusDescr: fix?.legalStatusDescr || (gsisData ? null : 'ΙΔΙΩΤΗΣ'),
          onomasia: fix?.onomasia || gsisData?.onomasia || name || null,
          commercialTitle: gsisData?.commercialTitle || null,
          regdate: gsisData?.regdate || null,
          postalAddress: gsisData?.postalAddress || null,
          postalAddressNo: gsisData?.postalAddressNo || null,
          postalZipCode: gsisData?.postalZipCode || null,
          postalAreaDescription: gsisData?.postalAreaDescription || null,
          doy: gsisData?.doy || null,
          doyDescr: gsisData?.doyDescr || null,
          notes: noteText,
          activities: gsisData?.activities?.length ? {
            create: gsisData.activities.map((a: any) => ({
              firmActCode: a.firmActCode,
              firmActDescr: a.firmActDescr,
              firmActKind: a.firmActKind ? parseInt(String(a.firmActKind)) : null,
              firmActKindDescr: a.firmActKindDescr,
            })),
          } : undefined,
        },
      })
      businessId = b.id
      created = true
    }

    // Everything after this point can be slow (matching, Viber retries, CM) —
    // run it after answering so the form's webhook never times out.
    processSignup({ businessId, program, matchedBy, resolvedReason: (resolved as any).reason, name, email, phone, answers, referrer, postTitle, postId })
      .catch(err => console.error('[website-signup] background processing failed:', err?.message || err))
      .finally(() => inFlight.delete(lockKey))

    return NextResponse.json({
      success: true,
      businessId,
      created,
      programId: program?.id ?? null,
      programTitle: program?.title ?? null,
      matchedBy,
      unmatchedProgram: !program,
    })
  } catch (err: any) {
    inFlight.delete(lockKey)
    console.error('[website-signup] failed:', err?.message || err)
    return NextResponse.json({ error: err?.message || 'Σφάλμα' }, { status: 500 })
  }
}

async function processSignup(p: {
  businessId: string
  program: Awaited<ReturnType<typeof prisma.program.findFirst>> | null
  matchedBy: string | null
  resolvedReason?: string
  name: string
  email: string | null
  phone: string | null
  answers: string[]
  referrer: string
  postTitle: string
  postId: string
}) {
  const appUrl = process.env.APP_URL || 'https://logistis.i-mentor.gr'
  const adminEmail = process.env.ADMIN_EMAIL || 'info@i-mentor.gr'
  const business = await prisma.business.findUnique({
    where: { id: p.businessId },
    select: { id: true, afm: true, onomasia: true, email: true, phone: true, viberPhone: true, accountantId: true },
  })
  if (!business) return
  const label = business.onomasia || p.name || business.afm

  // 1. Matching engine (all programs) — same as the AFM-update form.
  await runMatchingForBusiness(business.id).catch(err => console.error('[website-signup] matching failed:', err?.message))

  // Unidentified program → no guessing. Alert and stop.
  if (!p.program) {
    await sendEmail({
      to: adminEmail,
      subject: `⚠️ Φόρμα ιστοσελίδας: άγνωστο πρόγραμμα — ${label}`,
      html: `<p>Υποβολή από τη φόρμα ιστοσελίδας για <strong>${esc(label)}</strong> (ΑΦΜ ${esc(business.afm)}), αλλά το πρόγραμμα ΔΕΝ αναγνωρίστηκε με σιγουριά, οπότε <strong>δεν στάλθηκε μήνυμα στον πελάτη και δεν δημιουργήθηκε υπόθεση</strong>.</p>
        <ul><li>POST_ID: ${esc(p.postId) || '—'}</li><li>POST_TITLE: ${esc(p.postTitle) || '—'}</li><li>Referrer: ${esc(p.referrer) || '—'}</li></ul>
        <p>Συνδέστε τη σελίδα με το πρόγραμμα (wpPageId / URL) και επικοινωνήστε χειροκίνητα.</p>
        <p><a href="${appUrl}/businesses/${business.id}">Δείτε την επιχείρηση →</a></p>`,
    }).catch(() => {})
    return
  }
  const program = p.program

  // 2. Make sure THIS program is a match for the business, flagged as the
  //    client's own interest. notified:true — the client asked themselves, so
  //    this one must not go out in the accountants' "new matches" digest.
  const existingMatch = await prisma.programMatch.findUnique({
    where: { programId_businessId: { programId: program.id, businessId: business.id } },
    select: { id: true, status: true },
  })
  if (!existingMatch) {
    await prisma.programMatch.create({
      data: { programId: program.id, businessId: business.id, status: 'INTERESTED', notified: true, matchReason: ['Αίτημα από φόρμα ιστοσελίδας'] },
    })
  } else if (existingMatch.status !== 'SUBMITTED') {
    await prisma.programMatch.update({ where: { id: existingMatch.id }, data: { status: 'INTERESTED', notified: true } })
  }

  // 3. Already an open case for this business + program? Then this is a repeat
  //    submission: log it, tell the team, but don't message or open another.
  const openCase = await prisma.clientCase.findFirst({
    where: { businessId: business.id, programId: program.id, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
    select: { id: true, caseNumber: true },
  })
  if (openCase) {
    await prisma.caseActivity.create({
      data: {
        caseId: openCase.id, type: 'EXTERNAL',
        body: `Νέα υποβολή φόρμας ιστοσελίδας για το ίδιο πρόγραμμα.${p.answers.length ? '\n' + p.answers.join('\n') : ''}`,
        authorId: 'website-form', authorName: 'Φόρμα ιστοσελίδας', authorRole: 'ADMIN',
      },
    }).catch(() => {})
    await sendEmail({
      to: adminEmail,
      subject: `🔁 Νέα υποβολή φόρμας για ανοιχτή υπόθεση #${openCase.caseNumber} — ${label}`,
      html: `<p>Ο/Η <strong>${esc(label)}</strong> υπέβαλε ξανά τη φόρμα για «${esc(program.title)}». Δεν στάλθηκε νέο μήνυμα ούτε δημιουργήθηκε νέα υπόθεση.</p>
        <p><a href="${appUrl}/cases/${openCase.id}">Δείτε την υπόθεση →</a></p>`,
    }).catch(() => {})
    return
  }

  // Archived / inactive program: keep the lead and the match, but don't pitch a
  // closed program to the client.
  if (program.archived || !program.active) {
    await sendEmail({
      to: adminEmail,
      subject: `ℹ️ Φόρμα ιστοσελίδας για ανενεργό πρόγραμμα — ${label}`,
      html: `<p>Ο/Η <strong>${esc(label)}</strong> υπέβαλε τη φόρμα στη σελίδα του ανενεργού/αρχειοθετημένου προγράμματος «${esc(program.title)}». Δεν στάλθηκε μήνυμα στον πελάτη και δεν δημιουργήθηκε υπόθεση.</p>
        <p><a href="${appUrl}/businesses/${business.id}">Δείτε την επιχείρηση →</a></p>`,
    }).catch(() => {})
    return
  }

  // 4. Client outreach: Ερμής link for THIS program, email + Viber.
  const ermisLink = await getOrCreateErmisLink(business.id, program.id)
  // Hand the form answers to Ερμής as known facts (it is instructed never to
  // re-ask anything listed in contextSummary).
  if (p.answers.length) {
    const tok = await prisma.businessMatchToken.findUnique({
      where: { businessId_programId: { businessId: business.id, programId: program.id } },
      select: { contextSummary: true },
    })
    const formFacts = ['Απαντήσεις του πελάτη στη φόρμα της ιστοσελίδας:', ...p.answers.map(a => `- ${a}`)].join('\n')
    await prisma.businessMatchToken.update({
      where: { businessId_programId: { businessId: business.id, programId: program.id } },
      data: { contextSummary: [tok?.contextSummary, formFacts].filter(Boolean).join('\n\n') },
    }).catch(err => console.error('[website-signup] contextSummary failed:', err?.message))
  }
  const toEmail = business.email || p.email
  const toPhone = business.viberPhone || business.phone || p.phone
  let emailOk = false
  let viberOk = false
  if (toEmail) {
    emailOk = await sendEmail({
      to: toEmail,
      subject: `Συνεχίστε με τον Ερμή για το «${program.title}» — I-MENTOR`,
      html: `<p>Γεια σας,</p>
        <p>Ευχαριστούμε που ενδιαφερθήκατε για το πρόγραμμα <strong>«${esc(program.title)}»</strong>. Μιλήστε τώρα με τον ψηφιακό μας σύμβουλο, τον Ερμή, για να δούμε αμέσως αν και πώς μπορείτε να ενταχθείτε:</p>
        <p><a href="${ermisLink}">${ermisLink}</a></p>
        <p>Ένας σύμβουλος της I-MENTOR θα επικοινωνήσει επίσης μαζί σας.</p>`,
    }).catch(() => false)
  }
  if (toPhone) {
    const r = await sendViberMessage({
      to: toPhone,
      text: `Γεια σας! Ευχαριστούμε που ενδιαφερθήκατε για το πρόγραμμα «${program.title}». Μιλήστε τώρα με τον Ερμή για να δούμε αν μπορείτε να ενταχθείτε: ${ermisLink}`,
    }).catch(() => ({ ok: false, reason: 'exception' }))
    viberOk = r.ok
  }

  // 5. Case + Case Management assignment for this exact program.
  const description = [
    `Αίτημα από τη φόρμα ιστοσελίδας για «${program.title}».`,
    ...p.answers,
    `Στάλθηκε σύνδεσμος Ερμή (${[emailOk ? 'email' : null, viberOk ? 'Viber' : null].filter(Boolean).join(' + ') || 'καμία επιτυχής αποστολή'}).`,
  ].join('\n')
  const clientCase = await prisma.clientCase.create({
    data: {
      accountantId: business.accountantId,
      businessId: business.id,
      programId: program.id,
      requestType: 'APPLICATION_SUPPORT',
      title: `${label} — ${program.title}`,
      description,
      status: 'NEW',
      createdById: 'website-form',
      activities: {
        create: {
          type: 'EXTERNAL',
          body: `Η υπόθεση δημιουργήθηκε αυτόματα από φόρμα ιστοσελίδας (αναγνώριση προγράμματος: ${p.matchedBy}).\n${description}`,
          authorId: 'website-form', authorName: 'Φόρμα ιστοσελίδας', authorRole: 'ADMIN',
        },
      },
    },
    include: { accountant: { select: { officeName: true } } },
  })

  if (business.accountantId) {
    await prisma.notification.create({
      data: {
        accountantId: business.accountantId,
        type: 'CASE_UPDATE',
        title: `Ο πελάτης ${label} ζήτησε το «${program.title}»`,
        body: `Ο πελάτης σας υπέβαλε αίτημα από την ιστοσελίδα της I-MENTOR για το πρόγραμμα «${program.title}». Η I-MENTOR τον ενημέρωσε και θα συνεχίσει με τον φάκελο.`,
        link: `/cases/${clientCase.id}`,
      },
    }).catch(() => {})
  }

  const full = await prisma.business.findUnique({
    where: { id: business.id },
    select: { ...BUSINESS_PROFILE_SELECT, phone: true, viberPhone: true, email: true },
  })
  const profile = full ? await buildBusinessProfilePayload(full as any) : {}
  const cmLeadRef = await notifyCaseManagement({
    caseNumber: clientCase.caseNumber,
    phone: toPhone || null,
    email: toEmail || null,
    accountantOffice: clientCase.accountant?.officeName || null,
    caseType: null,
    description,
    priority: clientCase.priority,
    programTitle: program.title,
    program_exact_title: program.title,
    // Screening has NOT happened yet; but we already sent the Ερμής link
    // ourselves — CM must not start its own Ερμής/Viber outreach for this lead.
    ermis_completed: false,
    outreach_sent: emailOk || viberOk,
    ermis_link: ermisLink,
    lead_source: 'website-form',
    ...(profile as any),
  }).catch(err => { console.error('[website-signup] CM notify failed:', err?.message); return null })
  if (cmLeadRef) await prisma.clientCase.update({ where: { id: clientCase.id }, data: { externalRef: cmLeadRef } }).catch(() => {})

  await sendEmail({
    to: adminEmail,
    subject: `🆕 Νέα υπόθεση #${clientCase.caseNumber} από φόρμα ιστοσελίδας — ${label} (${program.title})`,
    html: `<p>Νέο αίτημα από τη φόρμα ιστοσελίδας για <strong>${esc(program.title)}</strong> (πρόγραμμα αναγνωρίστηκε με: ${esc(p.matchedBy)}).</p>
      <p>Πελάτης: <strong>${esc(label)}</strong> (ΑΦΜ ${esc(business.afm)})${business.accountantId ? ' — έχει λογιστή' : ''}.<br>Email: ${emailOk ? '✅' : '❌'} · Viber: ${viberOk ? '✅' : '❌'}</p>
      <p><a href="${appUrl}/cases/${clientCase.id}">Δείτε την υπόθεση →</a></p>`,
  }).catch(() => {})
}
