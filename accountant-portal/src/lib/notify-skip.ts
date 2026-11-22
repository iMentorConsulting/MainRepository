import { MatchStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'

// "Αποστολή Ειδοποιήσεων" tells businesses/accountants they match a program. It
// must NOT propose that for a business that already came in with interest in
// that SAME program — e.g. from Case Management, where Ερμής already
// messaged them (and may have talked to them) about it. Such a business carries
// a tag with the program's name (added on the CM / Ερμής flow) and/or a
// CM-originated Ερμής session for that program.
//
// Those matches are marked as notified (they are "handled"), so they leave the
// preview, the counters and the "pending notifications" list for good.

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

export async function markAlreadyEngagedMatchesNotified(programId?: string): Promise<number> {
  const matches = await prisma.programMatch.findMany({
    where: {
      notified: false,
      status: { not: MatchStatus.REJECTED },
      ...(programId ? { programId } : {}),
    },
    select: {
      id: true, businessId: true, programId: true,
      business: { select: { tags: true } },
      program: { select: { title: true } },
    },
  })
  if (matches.length === 0) return 0

  const byTag = new Set<string>()
  for (const m of matches) {
    const title = norm(m.program.title)
    if ((m.business.tags || []).some(t => norm(t) === title)) byTag.add(m.id)
  }

  // CM-originated Ερμής sessions (callbackUrl set) for exactly this business + program.
  const tokens = await prisma.businessMatchToken.findMany({
    where: {
      callbackUrl: { not: null },
      businessId: { in: Array.from(new Set(matches.map(m => m.businessId))) },
      ...(programId ? { programId } : {}),
    },
    select: { businessId: true, programId: true },
  })
  const tokenKeys = new Set(tokens.map(t => `${t.businessId}:${t.programId}`))

  const ids = matches
    .filter(m => byTag.has(m.id) || tokenKeys.has(`${m.businessId}:${m.programId}`))
    .map(m => m.id)
  if (ids.length === 0) return 0

  await prisma.programMatch.updateMany({ where: { id: { in: ids } }, data: { notified: true } })
  return ids.length
}
