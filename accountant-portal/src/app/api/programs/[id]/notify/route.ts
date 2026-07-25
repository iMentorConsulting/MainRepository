import { NextRequest, NextResponse } from 'next/server'
import { MatchStatus } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import { getOrCreateMatchActionToken } from '@/lib/match-action-token'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const program = await prisma.program.findUnique({
    where: { id: params.id },
    select: { id: true, title: true, otherRequirements: true },
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
      business: { select: { id: true, accountantId: true, onomasia: true, afm: true, email: true, phone: true } },
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
  const appUrl = process.env.APP_URL || 'https://logistis.i-mentor.gr'

  for (const [accountantId, accountantMatches] of Object.entries(byAccountant)) {
    const count = accountantMatches.length
    const accountant = await prisma.accountant.findUnique({
      where: { id: accountantId },
      select: { email: true, contactPerson: true },
    })
    if (!accountant) continue

    const title = `${count} πελάτ${count === 1 ? 'ης' : 'ες'} σας ταιριάζ${count === 1 ? 'ει' : 'ουν'} με το πρόγραμμα «${program.title}»`

    await prisma.notification.create({
      data: {
        accountantId,
        type: 'NEW_MATCHES',
        title,
        body: `Βρέθηκαν νέες ευκαιρίες χρηματοδότησης για ${count} πελάτ${count === 1 ? 'η' : 'ες'} σας μέσω του προγράμματος «${program.title}».`,
        link: '/matches',
      },
    })

    const actionToken = await getOrCreateMatchActionToken(accountantId, program.id)
    const actionUrl = `${appUrl}/match-action/${actionToken}`

    const withContact = accountantMatches.filter(m => m.business.email || m.business.phone).length
    const withoutContact = count - withContact

    const clientRowsHtml = accountantMatches.map(m => {
      const hasContact = !!(m.business.email || m.business.phone)
      return `<tr>
        <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${m.business.onomasia || '—'}</td>
        <td style="padding: 8px 12px; border: 1px solid #e5e7eb; color: #6b7280;">${m.business.afm}</td>
        <td style="padding: 8px 12px; border: 1px solid #e5e7eb; text-align: center;">${hasContact ? '✅' : '⚠️ Λείπουν'}</td>
      </tr>`
    }).join('')

    const missingContactHtml = withoutContact > 0
      ? `<div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 6px; margin: 20px 0;">
           <p style="margin: 0 0 6px; color: #92400e; font-size: 14px; font-weight: bold;">⚠️ ${withoutContact} πελάτ${withoutContact === 1 ? 'ης' : 'ες'} χωρίς στοιχεία επικοινωνίας</p>
           <p style="margin: 0; color: #92400e; font-size: 14px;">Για να τους ενημερώσει η I-MENTOR χρειάζεται email ή κινητό τηλέφωνο. Μπορείτε να τα προσθέσετε <strong>μαζικά με Excel</strong> μέσω της <a href="${appUrl}/businesses/enrich" style="color: #92400e; font-weight: bold;">σελίδας εμπλουτισμού επαφών</a> — ή ένα-ένα απευθείας στη σελίδα ανάθεσης.</p>
         </div>`
      : ''

    const requirementsHtml = program.otherRequirements
      ? `<div style="background: #f3f4f6; border-left: 4px solid #6b7280; padding: 16px; border-radius: 6px; margin: 20px 0;">
           <p style="margin: 0; color: #374151; font-size: 14px; font-weight: bold;">Πρόσθετες Προϋποθέσεις Προγράμματος:</p>
           <p style="margin: 8px 0 0; color: #374151; font-size: 14px; white-space: pre-line;">${program.otherRequirements}</p>
         </div>`
      : ''

    await sendEmail({
      to: accountant.email,
      subject: `🎯 ${count} πελάτες σας ταιριάζουν με «${program.title}» — I-MENTOR`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #374151;">
          <div style="background: linear-gradient(135deg, #4f46e5, #4338ca); padding: 24px 32px; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 20px; line-height: 1.3;">Νέες Ευκαιρίες Χρηματοδότησης<br>για τους Πελάτες σας</h1>
          </div>
          <div style="background: white; padding: 32px; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 12px 12px;">
            <p style="font-size: 16px; margin: 0 0 12px;">Αγαπητέ/ή <strong>${accountant.contactPerson}</strong>,</p>
            <p style="font-size: 15px; margin: 0 0 24px;">Το σύστημα I-MENTOR εντόπισε <strong style="color: #4f46e5;">${count} πελάτ${count === 1 ? 'η' : 'ες'} σας</strong> που είναι επιλέξιμοι για το πρόγραμμα <strong>«${program.title}»</strong>.</p>

            <div style="background: linear-gradient(135deg, #059669, #047857); border-radius: 12px; padding: 24px; margin: 0 0 24px; text-align: center;">
              <p style="color: white; font-size: 18px; font-weight: bold; margin: 0 0 10px;">Αφήστε μας να χειριστούμε τα πάντα!</p>
              <p style="color: #d1fae5; font-size: 14px; margin: 0 0 20px; line-height: 1.6;">Η I-MENTOR αναλαμβάνει να επικοινωνήσει με τους πελάτες σας, να τους ενημερώσει για το πρόγραμμα και — εφόσον εκφράσουν ενδιαφέρον — να προχωρήσει με τον φάκελό τους. Εσείς κρατάτε ευχαριστημένους τους πελάτες σας και κερδίζετε την προμήθειά σας!</p>
              <a href="${actionUrl}" style="background: white; color: #047857; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 15px; display: inline-block;">
                Ανάθεση σε I-MENTOR &rarr;
              </a>
            </div>

            <p style="font-size: 14px; font-weight: bold; margin: 0 0 8px;">Επιλέξιμοι πελάτες σας (${count}):</p>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 20px;">
              <thead>
                <tr style="background: #f9fafb;">
                  <th style="text-align: left; padding: 8px 12px; border: 1px solid #e5e7eb; color: #6b7280; font-weight: 600;">Επωνυμία</th>
                  <th style="text-align: left; padding: 8px 12px; border: 1px solid #e5e7eb; color: #6b7280; font-weight: 600;">ΑΦΜ</th>
                  <th style="text-align: center; padding: 8px 12px; border: 1px solid #e5e7eb; color: #6b7280; font-weight: 600;">Στοιχεία Επαφής</th>
                </tr>
              </thead>
              <tbody>
                ${clientRowsHtml}
              </tbody>
            </table>

            ${missingContactHtml}
            ${requirementsHtml}

            <div style="text-align: center; margin: 28px 0 8px;">
              <a href="${actionUrl}" style="background: linear-gradient(135deg, #4f46e5, #6366f1); color: white; padding: 14px 36px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block;">
                Επιλέξτε πελάτες για ανάθεση &rarr;
              </a>
              <p style="color: #9ca3af; font-size: 12px; margin: 10px 0 0;">Ο σύνδεσμος ισχύει για 45 ημέρες και δεν απαιτεί σύνδεση.</p>
            </div>
          </div>
          <div style="padding: 16px 32px; text-align: center;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0;">I-MENTOR Portal &middot; <a href="${appUrl}" style="color: #9ca3af; text-decoration: none;">logistis.i-mentor.gr</a></p>
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
