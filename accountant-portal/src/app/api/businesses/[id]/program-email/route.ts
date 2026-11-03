import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildAadeBusinessDetails } from '@/lib/business-profile'
import { buildProspectProgramEmailSubject, buildProspectProgramEmailHtml } from '@/lib/eligibility-email'
import { getOrCreateErmisLink } from '@/lib/ermis'
import { sendEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

// Lets an admin/consultant who's actively talking to a prospect send (or
// just preview) a focused, single-program email: the business's own AADE
// data, the specific reasons THIS business qualifies (from the stored
// ProgramMatch.matchReason — never the program's full ΚΑΔ/ΤΚ/legal-form rule
// lists), and that one program's info. Deliberately not accountant-branded —
// this is a direct I-MENTOR sales/consultant tool, not the accountant
// co-branded eligibility blast in eligibility-message.ts.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const isStaff = session.user.role === 'ADMIN' || session.user.role === 'CONSULTANT'
  if (!isStaff) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { programId, send } = await request.json().catch(() => ({}))
  if (typeof programId !== 'string' || !programId) {
    return NextResponse.json({ error: 'Λείπει το πρόγραμμα' }, { status: 400 })
  }

  const business = await prisma.business.findUnique({
    where: { id: params.id },
    include: { activities: true },
  })
  if (!business) return NextResponse.json({ error: 'Δεν βρέθηκε η επιχείρηση' }, { status: 404 })

  const match = await prisma.programMatch.findUnique({
    where: { programId_businessId: { programId, businessId: business.id } },
    include: { program: true },
  })
  if (!match || match.status === 'REJECTED') {
    return NextResponse.json({ error: 'Η επιχείρηση δεν είναι επιλέξιμη για αυτό το πρόγραμμα' }, { status: 400 })
  }

  const businessDetails = buildAadeBusinessDetails(business)
  const ermisUrl = await getOrCreateErmisLink(business.id, match.program.id)
  const appSetting = await prisma.appSetting.findUnique({ where: { id: 'main' } })

  const subject = buildProspectProgramEmailSubject(business.onomasia, match.program.title)
  const html = buildProspectProgramEmailHtml({
    businessName: business.onomasia,
    businessDetails,
    program: match.program,
    matchReasons: match.matchReason,
    ermisUrl,
    imentorLogoUrl: appSetting?.imentorLogoUrl,
  })

  if (send === true) {
    if (!business.email) {
      return NextResponse.json({ error: 'Η επιχείρηση δεν έχει καταχωρημένο email' }, { status: 400 })
    }
    const ok = await sendEmail({ to: business.email, subject, html })
    return NextResponse.json({ subject, html, sent: ok, hasEmail: true })
  }

  return NextResponse.json({ subject, html, sent: false, hasEmail: !!business.email })
}
