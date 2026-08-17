import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { lookupAfm } from '@/lib/gsis'
import { runMatchingForBusiness } from '@/lib/matching'
import { buildBusinessProfilePayload, BUSINESS_PROFILE_SELECT } from '@/lib/business-profile'

// Inbound endpoint for Case Management to create or look up a business by ΑΦΜ.
// Auth: header `x-api-key` must match env CASES_API_KEY (same secret used by
// the existing /api/external/cases integration).
//
// If the business already exists we NEVER call AADE again — we just return the
// cached profile. Repeated AADE lookups for the same ΑΦΜ are avoided deliberately
// (see case-management-sync.ts). Only a brand-new business triggers exactly one
// lookupAfm() call.

function checkApiKey(request: NextRequest): boolean {
  const key = process.env.CASES_API_KEY
  return !!key && request.headers.get('x-api-key') === key
}

// Natural persons (sole proprietors) come back from GSIS as
// "ΕΠΩΝΥΜΟ ΟΝΟΜΑ ΠΑΤΡΩΝΥΜΟ" with no legal status — trim the patronymic
// and label them as ΑΤΟΜΙΚΗ
function applySoleProprietorFix(gsisData: any): { onomasia: string | null; legalStatusDescr: string | null } {
  let onomasia = gsisData?.onomasia || ''
  let legalStatusDescr = gsisData?.legalStatusDescr || ''

  if (!legalStatusDescr) {
    const parts = onomasia.trim().split(/\s+/)
    if (parts.length >= 3) {
      onomasia = parts.slice(0, 2).join(' ')
    }
    legalStatusDescr = 'ΑΤΟΜΙΚΗ'
  }

  return { onomasia: onomasia || null, legalStatusDescr: legalStatusDescr || null }
}

export async function POST(request: NextRequest) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { afm, email, phone } = await request.json()
  const cleanAfm = String(afm || '').replace(/\D/g, '')
  if (!cleanAfm || cleanAfm.length !== 9) {
    return NextResponse.json({ error: 'Μη έγκυρο ΑΦΜ' }, { status: 400 })
  }

  const existing = await prisma.business.findUnique({ where: { afm: cleanAfm }, select: { id: true } })

  let business
  let created = false
  if (existing) {
    business = await prisma.business.findUnique({ where: { afm: cleanAfm }, select: BUSINESS_PROFILE_SELECT })
  } else {
    created = true
    let gsisData: any = null
    try {
      gsisData = await lookupAfm(cleanAfm)
    } catch {
      gsisData = null
    }

    const soleProprietorFix = gsisData ? applySoleProprietorFix(gsisData) : null

    const newBusiness = await prisma.business.create({
      data: {
        afm: cleanAfm,
        email: email || null,
        phone: phone || null,
        source: 'case-management',
        tags: ['Εγγραφή από Case Management'],
        legalStatusDescr: soleProprietorFix?.legalStatusDescr || (gsisData ? null : 'ΙΔΙΩΤΗΣ'),
        onomasia: soleProprietorFix?.onomasia || gsisData?.onomasia || null,
        commercialTitle: gsisData?.commercialTitle || null,
        regdate: gsisData?.regdate || null,
        postalAddress: gsisData?.postalAddress || null,
        postalAddressNo: gsisData?.postalAddressNo || null,
        postalZipCode: gsisData?.postalZipCode || null,
        postalAreaDescription: gsisData?.postalAreaDescription || null,
        doy: gsisData?.doy || null,
        doyDescr: gsisData?.doyDescr || null,
        notes: 'Εγγραφή μέσω Case Management',
        activities: gsisData?.activities?.length ? {
          create: gsisData.activities.map((a: any) => ({
            firmActCode: a.firmActCode,
            firmActDescr: a.firmActDescr,
            firmActKind: a.firmActKind ? parseInt(String(a.firmActKind)) : null,
            firmActKindDescr: a.firmActKindDescr,
          }))
        } : undefined,
      },
    })

    runMatchingForBusiness(newBusiness.id).catch(err => console.error('[CaseManagement] matching failed:', err?.message))

    business = await prisma.business.findUnique({ where: { id: newBusiness.id }, select: BUSINESS_PROFILE_SELECT })
  }

  if (!business) {
    return NextResponse.json({ error: 'Σφάλμα κατά τη δημιουργία επιχείρησης' }, { status: 500 })
  }

  const profile = await buildBusinessProfilePayload(business)

  return NextResponse.json({ businessId: business.id, created, ...profile }, { status: created ? 201 : 200 })
}
