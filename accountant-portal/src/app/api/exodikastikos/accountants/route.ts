import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { notIndividualWhere } from '@/lib/business-filters'
import { parseDeclaredClientCountFromNotes } from '@/lib/accountant-notes'

// Outbound directory for I-MENTOR's εξωδικαστικός app: lets their team pull
// the λογιστές already in Logistis so consultants can reach out and pitch
// the platform. Auth: header `x-api-key` must match env EXODIKASTIKOS_API_KEY
// (same shared secret already used by /api/external/exodikastikos).

function checkApiKey(request: NextRequest): boolean {
  const key = process.env.EXODIKASTIKOS_API_KEY
  return !!key && request.headers.get('x-api-key') === key
}

function formatAddress(b: { postalAddress: string | null; postalAddressNo: string | null; postalZipCode: string | null; postalAreaDescription: string | null }): string | null {
  const street = [b.postalAddress, b.postalAddressNo].filter(Boolean).join(' ')
  const locality = [b.postalZipCode, b.postalAreaDescription].filter(Boolean).join(' ')
  const full = [street, locality].filter(Boolean).join(', ')
  return full || null
}

export async function GET(request: NextRequest) {
  if (!checkApiKey(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accountants = await prisma.accountant.findMany({
    where: { active: true },
    select: {
      id: true,
      officeName: true,
      contactPerson: true,
      email: true,
      phone: true,
      address: true,
      afm: true,
      notes: true,
      declaredClientCount: true,
      businesses: {
        where: notIndividualWhere,
        select: { afm: true, postalAddress: true, postalAddressNo: true, postalZipCode: true, postalAreaDescription: true },
      },
      _count: {
        select: { users: { where: { lastLoginAt: { not: null } } } },
      },
    },
  })

  const result = accountants.map(a => {
    // The office's own ΑΦΜ is auto-created as one of its own Business rows
    // once approved (see /api/register) — it carries the real AADE-verified
    // address, but isn't an actual client and must be excluded from the count.
    const ownBusiness = a.businesses.find(b => b.afm === a.afm)
    const clientBusinesses = ownBusiness ? a.businesses.filter(b => b.afm !== a.afm) : a.businesses
    const verifiedAddress = ownBusiness ? formatAddress(ownBusiness) : null

    return {
      id: a.id,
      // Logistis doesn't have a separate "contact full name" vs "office name"
      // distinction beyond these two fields — contactPerson is the closest
      // match to a person's name; officeName is included too since εξωδικαστικός
      // may want it for context.
      name: a.contactPerson || a.officeName,
      office_name: a.officeName,
      phone: a.phone || null,
      email: a.email,
      // Best available address, in priority order: the AADE-verified address
      // from the office's own business record (most reliable — matches the
      // "Στοιχεία ΑΑΔΕ Γραφείου" panel in the admin UI), then the free-text
      // `address` field an admin may have typed manually, else null.
      address: verifiedAddress || a.address || null,
      // No structured neighbourhood-level data exists — `city` uses the
      // AADE-verified locality (ΔΟΥ area) when available, `area` stays null.
      city: ownBusiness?.postalAreaDescription || a.address || null,
      area: null as string | null,
      // Actual clients Logistis has on file for this office (excludes the
      // office's own business record and natural-person clients).
      client_count: clientBusinesses.length,
      // What the office self-declared at sign-up (e.g. "150+") — may be
      // materially higher than client_count if they haven't imported
      // everyone into Logistis yet. Null for offices added directly by an
      // admin (no self-registration questionnaire).
      declared_client_count: a.declaredClientCount || parseDeclaredClientCountFromNotes(a.notes),
      // "Already uses Logistis" = has at least one user account that has
      // actually logged in at least once (not just an account that exists).
      is_logistis_user: a._count.users > 0,
    }
  })

  result.sort((a, b) => b.client_count - a.client_count)

  return NextResponse.json(result)
}
