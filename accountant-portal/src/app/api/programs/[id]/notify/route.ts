import { NextRequest, NextResponse } from 'next/server'
import { MatchStatus } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const program = await prisma.program.findUnique({
    where: { id: params.id },
    select: { title: true, otherRequirements: true },
  })
  if (!program) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Optional selective send: if matchIds provided, only send those; otherwise send all pending.
  const body = await request.json().catch(() => ({}))
  const selectedMatchIds: string[] | undefined = Array.isArray(body.matchIds) && body.matchIds.length > 0 ? body.matchIds : undefined

  const unnotifiedMatches = await prisma.programMatch.findMany({
    where: {
      programId: params.id,
      notified: false,
      status: { not: MatchStatus.REJECTED },
      ...(selectedMatchIds ? { id: { in: selectedMatchIds } } : {}),
    },
    include: {
      business: { select: { id: true, accountantId: true, onomasia: true, afm: true } },
    },
  })

  if (unnotifiedMatches.length === 0) {
    return NextResponse.json({ notified: 0, message: 'Δεν υπάρχουν νέα matches για αποστολή' })
  }

  // Group by accountant
  const byAccountant: Record<string, typeof unnotifiedMatches> = {}
  for (const match of unnotifiedMatches) {
    const accountantId = match.business.accountantId
    if (!accountantId) continue
    if (!byAccountant[accountantId]) byAccountant[accountantId] = []
    byAccountant[accountantId].push(match)
  }

  let notifiedCount = 0

  for (const [accountantId, accountantMatches] of Object.entries(byAccountant)) {
    const count = accountantMatches.length
    const accountant = await prisma.accountant.findUnique({
      where: { id: accountantId },
      select: { email: true, contactPerson: true },
    })
    if (!accountant) continue

    const title = `${count} νέα match${count === 1 ? '' : 'es'} για τους πελάτες σας!`

    await prisma.notification.create({
      data: {
        accountantId,
        type: 'NEW_MATCHES',
        title,
        body: `Βρέθηκαν νέες ευκαιρίες χρηματοδότησης για ${count} πελάτ${count === 1 ? 'η' : 'ες'} σας μέσω του προγράμματος «${program.title}». Στείλτε καμπάνια τώρα!`,
        link: '/matches',
      },
    })

    const clientsListHtml = accountantMatches.map(m =>
      `<li>${m.business.onomasia || 'Άγνωστη επιχείρηση'} (ΑΦΜ: ${m.business.afm})</li>`
    ).join('')

    const requirementsHtml = program.otherRequirements
      ? `<div style="background: #f3f4f6; border-left: 4px solid #6b7280; padding: 16px; border-radius: 6px; margin: 20px 0;">
           <p style="margin: 0; color: #374151; font-size: 14px; font-weight: bold;">Πρόσθετες Προϋποθέσεις Προγράμματος:</p>
           <p style="margin: 8px 0 0; color: #374151; font-size: 14px; white-space: pre-line;">${program.otherRequirements}</p>
         </div>`
      : ''

    await sendEmail({
      to: accountant.email,
      subject: `🎯 ${title} — I-MENTOR Portal`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #4f46e5, #4338ca); padding: 24px 32px; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 22px;">🎯 Νέες Ευκαιρίες για τους Πελάτες σας!</h1>
          </div>
          <div style="background: white; padding: 32px; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 12px 12px;">
            <p style="color: #374151; font-size: 16px;">Αγαπητέ/ή <strong>${accountant.contactPerson}</strong>,</p>
            <p style="color: #374151; font-size: 16px;">
              Το σύστημα I-MENTOR εντόπισε <strong style="color: #4f46e5; font-size: 20px;">${count} νέα match${count === 1 ? '' : 'es'}</strong> για τους πελάτες σας μέσω του προγράμματος <strong>«${program.title}»</strong>!
            </p>
            <div style="background: #ede9fe; border-left: 4px solid #7c3aed; padding: 16px; border-radius: 6px; margin: 20px 0;">
              <p style="margin: 0; color: #5b21b6; font-size: 14px; font-weight: bold;">Πελάτες με νέο match:</p>
              <ul style="margin: 8px 0 0; padding-left: 20px; color: #5b21b6; font-size: 14px;">
                ${clientsListHtml}
              </ul>
            </div>
            ${requirementsHtml}
            <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 6px; margin: 20px 0;">
              <p style="margin: 0; color: #92400e; font-size: 14px; font-weight: bold;">⏰ Μην χάσουν την ευκαιρία οι πελάτες σας!</p>
              <p style="margin: 8px 0 0; color: #92400e; font-size: 14px;">
                Οι προθεσμίες υποβολής είναι περιορισμένες — στείλτε τώρα την καμπάνια ώστε οι πελάτες σας να επωφεληθούν έγκαιρα από το πρόγραμμα (και να εξασφαλίσετε παράλληλα την προμήθειά σας).
              </p>
            </div>
            <div style="text-align: center; margin: 24px 0;">
              <a href="${process.env.APP_URL || 'https://logistis.i-mentor.gr'}/matches"
                 style="background: linear-gradient(135deg, #4f46e5, #6366f1); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block;">
                Δείτε τα Matches &rarr;
              </a>
            </div>
          </div>
        </div>
      `,
    })

    notifiedCount += count
  }

  // Matches for businesses with no assigned accountant ("direct" I-MENTOR
  // clients) have nobody to email on the accountant side — instead, bundle
  // them into one internal email to the I-MENTOR team so they can reach out
  // directly (e.g. via Quick Send), and mark them notified so this doesn't
  // resurface every time the button is pressed.
  const directMatches = unnotifiedMatches.filter(m => !m.business.accountantId)
  if (directMatches.length > 0) {
    const adminEmail = process.env.ADMIN_EMAIL || 'info@i-mentor.gr'
    const directListHtml = directMatches.map(m =>
      `<li>${m.business.onomasia || 'Άγνωστη επιχείρηση'} (ΑΦΜ: ${m.business.afm})</li>`
    ).join('')
    await sendEmail({
      to: adminEmail,
      subject: `🎯 ${directMatches.length} match${directMatches.length === 1 ? '' : 'es'} χωρίς λογιστή — «${program.title}»`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <p>Βρέθηκ${directMatches.length === 1 ? 'ε' : 'αν'} <strong>${directMatches.length}</strong> match${directMatches.length === 1 ? '' : 'es'} για το πρόγραμμα <strong>«${program.title}»</strong> σε επιχειρήσεις χωρίς ανάθεση λογιστή (απευθείας πελάτες I-MENTOR):</p>
          <ul>${directListHtml}</ul>
          <p>Στείλτε τους ενημέρωση απευθείας μέσω Quick Send από το <a href="${process.env.APP_URL || 'https://logistis.i-mentor.gr'}/programs/${params.id}">πρόγραμμα</a>.</p>
        </div>
      `,
    }).catch(() => {})
  }

  // Mark every match that was actually acted upon as notified — either
  // emailed to its accountant, or bundled into the internal I-MENTOR email.
  const sentMatchIds = [...Object.values(byAccountant).flat(), ...directMatches].map(m => m.id)
  if (sentMatchIds.length > 0) {
    await prisma.programMatch.updateMany({
      where: { id: { in: sentMatchIds } },
      data: { notified: true },
    })
  }

  return NextResponse.json({
    notified: notifiedCount,
    accountants: Object.keys(byAccountant).length,
    directNotified: directMatches.length,
  })
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const preview = request.nextUrl.searchParams.get('preview') === 'true'

  if (!preview) {
    const count = await prisma.programMatch.count({
      where: { programId: params.id, notified: false, status: { not: MatchStatus.REJECTED } },
    })
    return NextResponse.json({ pending: count })
  }

  // Full preview: return accountants + their matched businesses
  const matches = await prisma.programMatch.findMany({
    where: { programId: params.id, notified: false, status: { not: MatchStatus.REJECTED } },
    include: {
      business: {
        select: {
          id: true, afm: true, onomasia: true, accountantId: true,
          accountant: { select: { id: true, officeName: true, contactPerson: true, email: true } },
        },
      },
    },
    orderBy: { business: { onomasia: 'asc' } },
  })

  const accountantMap: Record<string, { id: string; officeName: string; contactPerson: string; email: string; businesses: { matchId: string; id: string; afm: string; onomasia: string | null }[] }> = {}
  const directBusinesses: { matchId: string; id: string; afm: string; onomasia: string | null }[] = []

  for (const m of matches) {
    const acct = m.business.accountant
    if (!acct) {
      directBusinesses.push({ matchId: m.id, id: m.business.id, afm: m.business.afm, onomasia: m.business.onomasia })
    } else {
      if (!accountantMap[acct.id]) {
        accountantMap[acct.id] = { id: acct.id, officeName: acct.officeName, contactPerson: acct.contactPerson, email: acct.email, businesses: [] }
      }
      accountantMap[acct.id].businesses.push({ matchId: m.id, id: m.business.id, afm: m.business.afm, onomasia: m.business.onomasia })
    }
  }

  return NextResponse.json({
    pending: matches.length,
    accountants: Object.values(accountantMap).sort((a, b) => a.officeName.localeCompare(b.officeName, 'el')),
    directBusinesses,
  })
}
