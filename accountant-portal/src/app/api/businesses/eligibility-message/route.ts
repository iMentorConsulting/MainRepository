import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEligibilityMessages } from '@/lib/eligibility-message'

export const dynamic = 'force-dynamic'

const MAX_BUSINESSES = 200

// Lets an accountant (or admin) send the combined "Βρέθηκαν διαθέσιμα
// προγράμματα" message — every currently-eligible program in one message —
// to an explicit list of businesses, from the Matches page (bulk select),
// a single business's own page, or the Campaigns page ("all my clients").
// Unlike /api/admin/eligibility-email-backfill (admin-only, filter-driven,
// catch-up semantics gated by eligibilityEmailSentAt), this always sends to
// exactly the businesses named, regardless of whether they were messaged
// before.
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isAdmin = session.user.role === 'ADMIN'
  const isAccountant = session.user.role === 'ACCOUNTANT'
  if (!isAdmin && !isAccountant) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  // 'allMyClients' (accountant only) sends to every one of the accountant's
  // own businesses without the client needing to list/pass every id —
  // avoids both a huge request payload and the MAX_BUSINESSES cap below for
  // an office with a large pelatologio. Admin has the equivalent via
  // 'targetAccountantId': every client of ONE specific office they pick —
  // admin has no "own" clients, so there's no bare "all my clients" for them.
  const allMyClients = body.allMyClients === true && isAccountant
  const targetAccountantId: string | null = isAdmin && typeof body.targetAccountantId === 'string' ? body.targetAccountantId : null
  const businessIds: string[] = Array.isArray(body.businessIds) ? body.businessIds.filter((id: any) => typeof id === 'string') : []
  const hasBulkTarget = allMyClients || !!targetAccountantId
  if (!hasBulkTarget && businessIds.length === 0) return NextResponse.json({ error: 'Δεν επιλέχθηκαν επιχειρήσεις' }, { status: 400 })
  if (!hasBulkTarget && businessIds.length > MAX_BUSINESSES) {
    return NextResponse.json({ error: `Μέγιστο ${MAX_BUSINESSES} επιχειρήσεις ανά αποστολή` }, { status: 400 })
  }

  const channelsInput: string[] = Array.isArray(body.channels) ? body.channels : ['email']
  const channels = new Set(channelsInput.filter((c): c is 'email' | 'viber' => c === 'email' || c === 'viber'))
  if (channels.size === 0) return NextResponse.json({ error: 'Επιλέξτε τουλάχιστον ένα κανάλι (Email ή Viber)' }, { status: 400 })

  // Accountants can only ever message their own clients, and the message
  // always mentions their own office — there's no "send as I-MENTOR direct"
  // option for them, since they're the one initiating it for their own
  // business relationship. Only admin can choose 'direct'.
  const mode: 'direct' | 'accountant' = isAccountant ? 'accountant' : (body.mode === 'accountant' ? 'accountant' : 'direct')

  const where: any = allMyClients
    ? { accountantId: session.user.accountantId }
    : targetAccountantId
      ? { accountantId: targetAccountantId }
      : { id: { in: businessIds } }
  if (!hasBulkTarget && isAccountant) where.accountantId = session.user.accountantId

  const targets = await prisma.business.findMany({
    where,
    select: { id: true, afm: true, email: true, phone: true, viberPhone: true, accountantId: true },
  })

  const skippedNotOwned = !hasBulkTarget && isAccountant ? businessIds.length - targets.length : 0

  const outcome = await sendEligibilityMessages(targets, { mode, channels })

  return NextResponse.json({ ...outcome, skippedNotOwned })
}
