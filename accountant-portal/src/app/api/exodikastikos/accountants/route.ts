import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { notIndividualWhere } from '@/lib/business-filters'

// Outbound directory for I-MENTOR's εξωδικαστικός app: lets their team pull
// the λογιστές already in Logistis so consultants can reach out and pitch
// the platform. Auth: header `x-api-key` must match env EXODIKASTIKOS_API_KEY
// (same shared secret already used by /api/external/exodikastikos).

function checkApiKey(request: NextRequest): boolean {
  const key = process.env.EXODIKASTIKOS_API_KEY
  return !!key && request.headers.get('x-api-key') === key
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
      _count: {
        select: {
          businesses: { where: notIndividualWhere },
          users: { where: { lastLoginAt: { not: null } } },
        },
      },
    },
  })

  const result = accountants.map(a => ({
    id: a.id,
    // Logistis doesn't have a separate "contact full name" vs "office name"
    // distinction beyond these two fields — contactPerson is the closest
    // match to a person's name; officeName is included too since εξωδικαστικός
    // may want it for context.
    name: a.contactPerson || a.officeName,
    office_name: a.officeName,
    phone: a.phone || null,
    email: a.email,
    // Logistis stores the office address as one free-text field, not
    // structured city/area/neighbourhood columns, so there's nothing to
    // cleanly split into "city" vs "area". Best-effort: the full address
    // goes in `city`, `area` is always null. Ask if you'd rather receive
    // the raw `address` field only and parse it your side.
    city: a.address || null,
    area: null as string | null,
    client_count: a._count.businesses,
    // "Already uses Logistis" = has at least one user account that has
    // actually logged in at least once (not just an account that exists).
    is_logistis_user: a._count.users > 0,
  }))

  result.sort((a, b) => b.client_count - a.client_count)

  return NextResponse.json(result)
}
