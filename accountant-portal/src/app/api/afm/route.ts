import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { lookupAfm } from '@/lib/gsis'

const PENDING_APPROVAL_MESSAGE = 'Η αναζήτηση επιχειρήσεων μέσω ΑΑΔΕ θα ενεργοποιηθεί μόλις εγκριθεί ο λογαριασμός σας από την ομάδα της I-MENTOR.'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (session.user.role === 'ACCOUNTANT' && session.user.accountantId) {
    const accountant = await prisma.accountant.findUnique({ where: { id: session.user.accountantId }, select: { approved: true } })
    if (accountant && !accountant.approved) {
      return NextResponse.json({ error: PENDING_APPROVAL_MESSAGE, pendingApproval: true }, { status: 403 })
    }
  }

  const afm = request.nextUrl.searchParams.get('afm')
  if (!afm || !/^\d{9}$/.test(afm)) {
    return NextResponse.json({ error: 'Μη έγκυρο ΑΦΜ' }, { status: 400 })
  }

  const realData = await lookupAfm(afm)
  if (realData) return NextResponse.json(realData)

  return NextResponse.json(
    { error: 'Δεν ήταν δυνατή η ανάκτηση στοιχείων από ΓΓΠΣ.' },
    { status: 503 }
  )
}
