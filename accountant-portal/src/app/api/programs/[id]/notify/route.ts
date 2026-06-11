import { NextRequest, NextResponse } from 'next/server'
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

  // Find all un-notified matches for this program, grouped by accountant
  const unnotifiedMatches = await prisma.programMatch.findMany({
    where: { programId: params.id, notified: false },
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

  // Mark all as notified
  await prisma.programMatch.updateMany({
    where: { programId: params.id, notified: false },
    data: { notified: true },
  })

  return NextResponse.json({ notified: notifiedCount, accountants: Object.keys(byAccountant).length })
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const count = await prisma.programMatch.count({
    where: { programId: params.id, notified: false },
  })

  return NextResponse.json({ pending: count })
}
