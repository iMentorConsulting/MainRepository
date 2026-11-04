import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { lookupAfm } from '@/lib/gsis'
import { runMatchingForBusiness } from '@/lib/matching'

export const dynamic = 'force-dynamic'

// Admin-only: for an older accounting office with no ΑΦΜ on file (so its
// AADE details never got pulled at registration — see pendingBusinessData
// in accountants/[id]/route.ts PUT), look it up now from a manually entered
// ΑΦΜ and create/update the office's own "self as client" Business record.
// Separate from the normal per-business "add/refresh" flows since this one
// also writes the ΑΦΜ back onto the Accountant itself.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { afm } = await request.json().catch(() => ({}))
  if (typeof afm !== 'string' || !/^\d{9}$/.test(afm)) {
    return NextResponse.json({ error: 'Μη έγκυρο ΑΦΜ (9 ψηφία)' }, { status: 400 })
  }

  const accountant = await prisma.accountant.findUnique({ where: { id: params.id } })
  if (!accountant) return NextResponse.json({ error: 'Δεν βρέθηκε ο λογιστής' }, { status: 404 })

  const gsisData = await lookupAfm(afm)
  if (!gsisData) {
    return NextResponse.json({ error: 'Δεν ήταν δυνατή η ανάκτηση στοιχείων από την ΑΑΔΕ για αυτό το ΑΦΜ' }, { status: 503 })
  }

  await prisma.accountant.update({ where: { id: params.id }, data: { afm } })

  const aadeFields = {
    onomasia: gsisData.onomasia,
    commercialTitle: gsisData.commercialTitle,
    legalStatusDescr: gsisData.legalStatusDescr,
    firmFlagDescr: gsisData.firmFlagDescr,
    iNiFlagDescr: gsisData.iNiFlagDescr,
    deactivationFlag: gsisData.deactivationFlag,
    deactivationFlagDescr: gsisData.deactivationFlagDescr,
    regdate: gsisData.regdate,
    stopDate: gsisData.stopDate,
    postalAddress: gsisData.postalAddress,
    postalAddressNo: gsisData.postalAddressNo,
    postalZipCode: gsisData.postalZipCode,
    postalAreaDescription: gsisData.postalAreaDescription,
    doy: gsisData.doy,
    doyDescr: gsisData.doyDescr,
  }

  const existingBusiness = await prisma.business.findUnique({ where: { afm } })
  let business
  if (existingBusiness) {
    business = await prisma.business.update({
      where: { afm },
      data: { ...aadeFields, accountantId: params.id },
    })
  } else {
    business = await prisma.business.create({
      data: { ...aadeFields, afm, accountantId: params.id, email: accountant.email, tags: [] },
    })
  }

  runMatchingForBusiness(business.id).catch(err => console.error('[AccountantRefreshAfm] matching failed:', err?.message))

  return NextResponse.json({ afm, business })
}
