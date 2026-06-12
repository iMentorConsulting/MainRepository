import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { reconcileMatchStatuses } from '@/lib/matching'
import { sendEmail } from '@/lib/email'

// Admin-triggered, ad-hoc notification: sends a specific accountant the matches
// for a specific program, regardless of the `notified` flag used by the bulk
// per-program notify flow. Does not touch `notified` — purely additional/extra.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { accountantId } = await request.json().catch(() => ({}))
  if (!accountantId) {
    return NextResponse.json({ error: 'Δεν επιλέχθηκε λογιστής' }, { status: 400 })
  }

  const program = await prisma.program.findUnique({
    where: { id: params.id },
    select: { title: true, otherRequirements: true },
  })
  if (!program) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const accountant = await prisma.accountant.findUnique({
    where: { id: accountantId },
    select: { email: true, contactPerson: true },
  })
  if (!accountant) return NextResponse.json({ error: 'Ο λογιστής δεν βρέθηκε' }, { status: 404 })

  const allMatches = await prisma.programMatch.findMany({
    where: {
      programId: params.id,
      matchScore: { gte: 40 },
      business: { accountantId },
    },
    include: {
      business: { select: { onomasia: true, afm: true } },
      criterionChecks: true,
    },
  })
  await reconcileMatchStatuses(allMatches)
  const matches = allMatches.filter(m => m.status !== 'REJECTED')

  if (matches.length === 0) {
    return NextResponse.json({ notified: 0, message: 'Δεν υπάρχουν matches για αυτόν τον λογιστή σε αυτό το πρόγραμμα' })
  }

  const count = matches.length
  const title = `${count} match${count === 1 ? '' : 'es'} για τους πελάτες σας!`

  await prisma.notification.create({
    data: {
      accountantId,
      type: 'NEW_MATCHES',
      title,
      body: `Έχετε ${count} match${count === 1 ? '' : 'es'} για ${count === 1 ? 'τον πελάτη σας' : 'τους πελάτες σας'} μέσω του προγράμματος «${program.title}». Στείλτε καμπάνια τώρα!`,
      link: '/matches',
    },
  })

  const clientsListHtml = matches.map(m =>
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
            Έχετε <strong style="color: #4f46e5; font-size: 20px;">${count} match${count === 1 ? '' : 'es'}</strong> μέσω του προγράμματος <strong>«${program.title}»</strong>!
          </p>
          <div style="background: #ede9fe; border-left: 4px solid #7c3aed; padding: 16px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 0; color: #5b21b6; font-size: 14px; font-weight: bold;">Πελάτες με match:</p>
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

  return NextResponse.json({ notified: count })
}

// Returns matches for a given accountant on this program, for preview purposes.
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = request.nextUrl
  const accountantId = searchParams.get('accountantId')
  if (!accountantId) return NextResponse.json({ error: 'Missing accountantId' }, { status: 400 })

  const allMatches = await prisma.programMatch.findMany({
    where: {
      programId: params.id,
      matchScore: { gte: 40 },
      business: { accountantId },
    },
    include: {
      business: { select: { onomasia: true, afm: true } },
      criterionChecks: true,
    },
    orderBy: { matchScore: 'desc' },
  })
  await reconcileMatchStatuses(allMatches)
  const matches = allMatches.filter(m => m.status !== 'REJECTED')

  return NextResponse.json({ matches })
}
