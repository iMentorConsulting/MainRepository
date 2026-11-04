import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CURRENT_TEMPLATE_VERSION, getContractClauses } from '@/lib/accountant-contract-template'

export const dynamic = 'force-dynamic'

function generateContractCode(): string {
  return `IM-${randomBytes(5).toString('hex').toUpperCase()}`
}

async function buildPrefill(accountantId: string) {
  const accountant = await prisma.accountant.findUnique({ where: { id: accountantId } })
  if (!accountant) return null

  // The office's own AADE-sourced record, if it was ever auto-created (see
  // accountants/[id]/route.ts PUT) — richer than the bare Accountant fields
  // (legal form, ΔΟΥ), so prefer it; fall back to Accountant's own fields
  // for an office created without that flow.
  const ownBusiness = accountant.afm
    ? await prisma.business.findUnique({ where: { afm: accountant.afm } })
    : null

  return {
    officeOnomasia: ownBusiness?.onomasia || accountant.officeName,
    officeAfm: ownBusiness?.afm || accountant.afm,
    officeAddress: ownBusiness
      ? [ownBusiness.postalAddress, ownBusiness.postalAddressNo].filter(Boolean).join(' ') +
        (ownBusiness.postalZipCode || ownBusiness.postalAreaDescription ? `, ${[ownBusiness.postalZipCode, ownBusiness.postalAreaDescription].filter(Boolean).join(' ')}` : '')
      : accountant.address,
    officeLegalStatus: ownBusiness?.legalStatusDescr || null,
    officeDoy: ownBusiness?.doyDescr || null,
    signerName: accountant.contactPerson,
  }
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let accountantId: string | null = null
  if (session.user.role === 'ACCOUNTANT') {
    accountantId = session.user.accountantId ?? null
  } else if (session.user.role === 'ADMIN') {
    accountantId = request.nextUrl.searchParams.get('accountantId')
  } else {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!accountantId) return NextResponse.json({ error: 'Λείπει ο λογαριασμός λογιστή' }, { status: 400 })

  const contract = await prisma.accountantContract.findUnique({ where: { accountantId } })
  const prefill = contract ? null : await buildPrefill(accountantId)

  return NextResponse.json({
    contract,
    prefill,
    clauses: getContractClauses(
      contract
        ? { officeOnomasia: contract.officeOnomasia, officeAfm: contract.officeAfm, officeAddress: contract.officeAddress, officeLegalStatus: contract.officeLegalStatus, officeDoy: contract.officeDoy, signerName: contract.signerName }
        : prefill!
    ),
  })
}

// Accountant-only: signs their own (single, permanent) contract. No
// re-signing — once a row exists for this accountantId, further attempts
// are rejected.
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ACCOUNTANT' || !session.user.accountantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const accountantId = session.user.accountantId

  const existing = await prisma.accountantContract.findUnique({ where: { accountantId } })
  if (existing) return NextResponse.json({ error: 'Η σύμβαση έχει ήδη υπογραφεί' }, { status: 409 })

  const body = await request.json().catch(() => ({}))
  const signerName = typeof body.signerName === 'string' ? body.signerName.trim() : ''
  if (!signerName) return NextResponse.json({ error: 'Απαιτείται όνομα υπογράφοντος' }, { status: 400 })
  if (body.accepted !== true) return NextResponse.json({ error: 'Απαιτείται αποδοχή των όρων' }, { status: 400 })

  const prefill = await buildPrefill(accountantId)
  if (!prefill) return NextResponse.json({ error: 'Δεν βρέθηκε ο λογαριασμός' }, { status: 404 })

  let code = generateContractCode()
  for (let attempt = 0; attempt < 5; attempt++) {
    const clash = await prisma.accountantContract.findUnique({ where: { uniqueCode: code } })
    if (!clash) break
    code = generateContractCode()
  }

  const contract = await prisma.accountantContract.create({
    data: {
      accountantId,
      officeOnomasia: prefill.officeOnomasia,
      officeAfm: prefill.officeAfm,
      officeAddress: prefill.officeAddress,
      officeLegalStatus: prefill.officeLegalStatus,
      officeDoy: prefill.officeDoy,
      signerName,
      uniqueCode: code,
      templateVersion: CURRENT_TEMPLATE_VERSION,
    },
  })

  return NextResponse.json(contract, { status: 201 })
}
