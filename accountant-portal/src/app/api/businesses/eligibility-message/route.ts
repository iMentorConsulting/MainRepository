import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEligibilityMessages, sendEligibilityMessageTest } from '@/lib/eligibility-message'

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
  // Admin-only: businesses that are direct I-MENTOR clients with no λογιστής
  // at all. Mutually exclusive with targetAccountantId — both target a bulk
  // set, so either one on its own counts as a "bulk" target below.
  const noAccountant = isAdmin && body.noAccountant === true
  const businessIds: string[] = Array.isArray(body.businessIds) ? body.businessIds.filter((id: any) => typeof id === 'string') : []
  const hasBulkTarget = allMyClients || !!targetAccountantId || noAccountant
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
  // business relationship. Only admin can choose 'direct'. A business with no
  // accountant has nothing to mention, so it's forced to 'direct' regardless.
  const mode: 'direct' | 'accountant' = noAccountant ? 'direct' : isAccountant ? 'accountant' : (body.mode === 'accountant' ? 'accountant' : 'direct')

  const where: any = allMyClients
    ? { accountantId: session.user.accountantId }
    : targetAccountantId
      ? { accountantId: targetAccountantId }
      : noAccountant
        ? { accountantId: null }
        : { id: { in: businessIds } }
  if (!hasBulkTarget && isAccountant) where.accountantId = session.user.accountantId

  const targets = await prisma.business.findMany({
    where,
    select: { id: true, afm: true, email: true, phone: true, viberPhone: true, accountantId: true },
  })

  const skippedNotOwned = !hasBulkTarget && isAccountant ? businessIds.length - targets.length : 0

  // Test send: fires ONE real message (real eligibility data, from the first
  // currently-eligible business in the target set) to an explicit
  // email/phone instead of any real business's own contact — lets an admin
  // or accountant confirm delivery end-to-end before touching the real list.
  // Nothing is marked as sent and no bulk sending happens on this branch.
  const testEmail: string | undefined = typeof body.testEmail === 'string' && body.testEmail.trim() ? body.testEmail.trim() : undefined
  const testPhone: string | undefined = typeof body.testPhone === 'string' && body.testPhone.trim() ? body.testPhone.trim() : undefined
  if (testEmail || testPhone) {
    const testResult = await sendEligibilityMessageTest(targets, { mode, channels, testEmail, testPhone })
    return NextResponse.json({ test: true, ...testResult })
  }

  // Dry run: runs the real eligibility check against every target so the
  // counts are accurate, but never actually sends anything or writes to the
  // DB — used to show "this will send X emails / Y Viber" before the real,
  // irreversible send.
  const dryRun = body.dryRun === true

  const outcome = await sendEligibilityMessages(targets, { mode, channels, dryRun })

  return NextResponse.json({ ...outcome, skippedNotOwned })
}
